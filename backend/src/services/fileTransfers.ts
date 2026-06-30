import crypto from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import yazl from 'yazl';
import { fileTransferJobRepository, serverRepository } from '../database/index.js';
import { parsePayload, serializeFileTransferJob } from '../database/repositories/fileTransferJobRepository.js';
import type { FileTransferJobRow } from '../types/database.js';
import { ensureIsDir, ensureIsFile, ensureResolvedPathInsideRoot, getBasenameFromApiPath, guessContentTypeByName } from '../utils/fsBrowser.js';
import { getServerStoragePaths } from '../utils/storage.js';
import { getRuntimeOwnership } from '../providers/runtimeConfig.js';
import { resolveServerPath } from './fileExplorer.js';
import { logError } from '../utils/logger.js';
import { nowIso } from '../utils/time.js';

export const SMALL_UPLOAD_LIMIT_BYTES = 64 * 1024 * 1024;
export const DEFAULT_UPLOAD_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_CHUNK_SIZE_BYTES = 32 * 1024 * 1024;
export const FILE_TRANSFER_FINISHED_RETENTION_MS = 60 * 60_000;
const FILE_TRANSFER_CLEANUP_INTERVAL_MS = 10 * 60_000;
const MAX_RELATIVE_PATH_LENGTH = 1024;

type CreateUploadSessionInput = {
    serverId: number;
    root?: string;
    path?: string;
    totalBytes?: number;
    totalFiles?: number;
    overwrite?: boolean;
};

type UploadChunkInput = {
    serverId: number;
    uploadId: number;
    relativePath: string;
    chunkIndex: number;
    totalChunks: number;
    fileSize: number;
    stream: Readable;
    contentLength: number;
};

type DirectUploadInput = {
    serverId: number;
    root?: string;
    path: string;
    stream: Readable;
    contentLength: number;
    overwrite: boolean;
};

type DownloadTarget = {
    root: string;
    path: string;
    absPath: string;
    rootDir: string;
    filename: string;
    type: 'file' | 'dir';
    size: number;
    contentType?: string;
};

function positiveInt(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function normalizeOverwrite(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
    return false;
}

function normalizeRelativePath(raw: unknown): string {
    if (typeof raw !== 'string') {
        throw Object.assign(new Error('relativePath must be a string'), { statusCode: 400 });
    }

    const trimmed = raw.trim().replace(/\\/g, '/');
    if (!trimmed || trimmed.length > MAX_RELATIVE_PATH_LENGTH || trimmed.includes('\0')) {
        throw Object.assign(new Error('relativePath is invalid'), { statusCode: 400 });
    }

    const normalized = path.posix.normalize(`/${trimmed}`).replace(/^\/+/, '');
    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
        throw Object.assign(new Error('relativePath is invalid'), { statusCode: 400 });
    }

    return normalized;
}

function joinApiPath(basePath: string, relativePath: string): string {
    const base = basePath && basePath !== '/' ? basePath : '/';
    const joined = path.posix.normalize(path.posix.join(base, relativePath));
    return joined.startsWith('/') ? joined : `/${joined}`;
}

function transferRoot(serverId: number): string {
    return path.join(getServerStoragePaths(serverId).serverRoot, '.state', 'file-transfers');
}

function jobDir(serverId: number, jobId: number): string {
    return path.join(transferRoot(serverId), String(jobId));
}

export async function purgeFinishedFileTransferJobs(
    retentionMs = FILE_TRANSFER_FINISHED_RETENTION_MS
): Promise<{ purged: number }> {
    const rows = await fileTransferJobRepository.listFinishedOlderThan(Math.ceil(retentionMs / 1000));

    for (const row of rows) {
        await fs.rm(jobDir(row.server_id, row.id), { recursive: true, force: true }).catch((error) => {
            logError('FILE_TRANSFER:CLEANUP:TEMP_DIR', error, {
                serverId: row.server_id,
                jobId: row.id,
            });
        });
    }

    await fileTransferJobRepository.deleteByIds(rows.map((row) => row.id));
    return { purged: rows.length };
}

export function startFileTransferCleanupJob(): { stop: () => void } {
    let running = false;

    const run = async () => {
        if (running) return;
        running = true;
        try {
            await purgeFinishedFileTransferJobs();
        } catch (error) {
            logError('FILE_TRANSFER:CLEANUP', error);
        } finally {
            running = false;
        }
    };

    void run();
    const timer = setInterval(() => void run(), FILE_TRANSFER_CLEANUP_INTERVAL_MS);

    return {
        stop() {
            clearInterval(timer);
        },
    };
}

function fileKey(relativePath: string): string {
    return crypto.createHash('sha256').update(relativePath).digest('hex');
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

async function readJson<T>(filePath: string): Promise<T | null> {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
    } catch (error: any) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
}

async function safeChown(serverId: number, targetPath: string): Promise<void> {
    const server = await serverRepository.findById(serverId);
    if (!server) return;

    const ownership = getRuntimeOwnership(server);
    if (!ownership) return;

    await fs.chown(targetPath, ownership.uid, ownership.gid).catch(() => undefined);
}

async function ensureParentDirsWithOwnership(serverId: number, rootDir: string, targetPath: string): Promise<void> {
    const parent = path.dirname(targetPath);
    await ensureResolvedPathInsideRoot(parent, rootDir).catch(async (error: any) => {
        if (error?.statusCode !== 404) throw error;
    });

    await fs.mkdir(parent, { recursive: true });
    await ensureResolvedPathInsideRoot(parent, rootDir);
    await safeChown(serverId, parent);
}

async function assertTargetWritable(targetPath: string, overwrite: boolean): Promise<void> {
    const existing = await fs.lstat(targetPath).catch(() => null);
    if (!existing) return;
    if (existing.isSymbolicLink()) {
        throw Object.assign(new Error('Symbolic links are not allowed'), { statusCode: 400 });
    }
    if (existing.isDirectory()) {
        throw Object.assign(new Error('Target path is a directory'), { statusCode: 409 });
    }
    if (!overwrite) {
        throw Object.assign(new Error('Target file already exists'), { statusCode: 409 });
    }
}

async function writeStreamToFile(params: {
    stream: Readable;
    destination: string;
    maxBytes: number;
}): Promise<number> {
    await fs.mkdir(path.dirname(params.destination), { recursive: true });
    const temp = `${params.destination}.tmp-${crypto.randomUUID()}`;
    let written = 0;

    try {
        params.stream.on('data', (chunk: Buffer) => {
            written += chunk.length;
            if (written > params.maxBytes) {
                params.stream.destroy(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
            }
        });

        await pipeline(params.stream, createWriteStream(temp, { flags: 'w' }));
        await fs.rename(temp, params.destination);
        return written;
    } catch (error) {
        await fs.rm(temp, { force: true }).catch(() => undefined);
        throw error;
    }
}

async function getTargetPath(params: {
    serverId: number;
    root?: string;
    apiPath: string;
}): Promise<{ apiPath: string; absPath: string; rootDir: string; root: string }> {
    const resolved = await resolveServerPath({
        serverId: params.serverId,
        root: params.root,
        path: params.apiPath,
    });
    return resolved;
}

export async function createUploadSession(input: CreateUploadSessionInput) {
    const root = input.root || 'data';
    const basePath = input.path || '/';
    const base = await resolveServerPath({ serverId: input.serverId, root, path: basePath });
    await ensureIsDir(base.absPath, base.rootDir);

    const job = await fileTransferJobRepository.create({
        serverId: input.serverId,
        kind: 'upload',
        root: base.root,
        basePath: base.apiPath,
        totalBytes: positiveInt(input.totalBytes),
        totalFiles: positiveInt(input.totalFiles),
        payload: {
            overwrite: Boolean(input.overwrite),
            chunkSize: DEFAULT_UPLOAD_CHUNK_SIZE_BYTES,
            maxChunkSize: MAX_UPLOAD_CHUNK_SIZE_BYTES,
        },
    });

    await fs.mkdir(jobDir(input.serverId, job.id), { recursive: true });
    return serializeFileTransferJob(job);
}

export async function getFileTransferJob(serverId: number, jobId: number) {
    const row = await fileTransferJobRepository.findByIdForServer(jobId, serverId);
    if (!row) throw Object.assign(new Error('File transfer job not found'), { statusCode: 404 });
    return serializeFileTransferJob(row);
}

export async function listFileTransferJobs(serverId: number, limit = 20) {
    const rows = await fileTransferJobRepository.listRecentForServer(serverId, Math.min(Math.max(limit, 1), 100));
    return rows.map(serializeFileTransferJob);
}

export async function cancelUploadSession(serverId: number, jobId: number) {
    const row = await fileTransferJobRepository.findByIdForServer(jobId, serverId);
    if (!row || row.kind !== 'upload') {
        throw Object.assign(new Error('Upload session not found'), { statusCode: 404 });
    }

    await fs.rm(jobDir(serverId, jobId), { recursive: true, force: true }).catch(() => undefined);
    const updated = await fileTransferJobRepository.cancel(jobId);
    return updated ? serializeFileTransferJob(updated) : serializeFileTransferJob(row);
}

export async function completeUploadSession(serverId: number, jobId: number) {
    const row = await fileTransferJobRepository.findByIdForServer(jobId, serverId);
    if (!row || row.kind !== 'upload') {
        throw Object.assign(new Error('Upload session not found'), { statusCode: 404 });
    }

    if (row.status === 'completed') return serializeFileTransferJob(row);
    if (row.status === 'failed' || row.status === 'cancelled') {
        throw Object.assign(new Error(`Upload session is ${row.status}`), { statusCode: 409 });
    }

    if (row.total_files > 0 && row.completed_files < row.total_files) {
        throw Object.assign(new Error('Upload session still has pending files'), { statusCode: 409 });
    }
    if (row.total_bytes > 0 && row.transferred_bytes < row.total_bytes) {
        throw Object.assign(new Error('Upload session still has pending bytes'), { statusCode: 409 });
    }

    await fs.rm(jobDir(serverId, jobId), { recursive: true, force: true }).catch(() => undefined);
    const updated = await fileTransferJobRepository.complete(jobId);
    return updated ? serializeFileTransferJob(updated) : serializeFileTransferJob(row);
}

async function getChunkJob(serverId: number, jobId: number): Promise<FileTransferJobRow> {
    const row = await fileTransferJobRepository.findByIdForServer(jobId, serverId);
    if (!row || row.kind !== 'upload') {
        throw Object.assign(new Error('Upload session not found'), { statusCode: 404 });
    }
    if (row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled') {
        throw Object.assign(new Error(`Upload session is ${row.status}`), { statusCode: 409 });
    }
    return row;
}

export async function receiveUploadChunk(input: UploadChunkInput) {
    if (input.chunkIndex < 0 || input.chunkIndex >= input.totalChunks || input.totalChunks < 1) {
        throw Object.assign(new Error('Invalid chunk index'), { statusCode: 400 });
    }
    if (input.contentLength < 0 || input.contentLength > MAX_UPLOAD_CHUNK_SIZE_BYTES) {
        throw Object.assign(new Error('Chunk is too large'), { statusCode: 413 });
    }
    if (input.fileSize < 0) {
        throw Object.assign(new Error('Invalid file size'), { statusCode: 400 });
    }

    const row = await getChunkJob(input.serverId, input.uploadId);
    const payload = parsePayload(row);
    const overwrite = Boolean(payload.overwrite);
    const relativePath = normalizeRelativePath(input.relativePath);
    const key = fileKey(relativePath);
    const fileDir = path.join(jobDir(input.serverId, row.id), key);
    const chunksDir = path.join(fileDir, 'chunks');
    const chunkPath = path.join(chunksDir, `${input.chunkIndex}.part`);
    const metaPath = path.join(fileDir, 'meta.json');
    const completedPath = path.join(fileDir, 'completed.json');

    if (await readJson(completedPath)) {
        return serializeFileTransferJob(row);
    }

    await fs.mkdir(chunksDir, { recursive: true });

    const existing = await fs.stat(chunkPath).catch(() => null);
    const previousSize = existing?.isFile() ? existing.size : 0;
    const written = await writeStreamToFile({
        stream: input.stream,
        destination: chunkPath,
        maxBytes: MAX_UPLOAD_CHUNK_SIZE_BYTES,
    });

    await writeJson(metaPath, {
        relativePath,
        fileSize: input.fileSize,
        totalChunks: input.totalChunks,
    });

    await fileTransferJobRepository.start(row.id);
    let fresh = await fileTransferJobRepository.findById(row.id);
    const nextTransferred = Math.max(0, (fresh?.transferred_bytes ?? row.transferred_bytes) + written - previousSize);
    fresh = await fileTransferJobRepository.updateProgress(row.id, {
        transferredBytes: nextTransferred,
    }) ?? fresh;

    const chunkEntries = await fs.readdir(chunksDir).catch(() => []);
    const received = new Set(
        chunkEntries
            .map((entry) => Number.parseInt(entry.replace(/\.part$/, ''), 10))
            .filter((index) => Number.isInteger(index))
    );

    if (received.size < input.totalChunks) {
        return fresh ? serializeFileTransferJob(fresh) : serializeFileTransferJob(row);
    }

    for (let index = 0; index < input.totalChunks; index += 1) {
        if (!received.has(index)) {
            return fresh ? serializeFileTransferJob(fresh) : serializeFileTransferJob(row);
        }
    }

    const targetApiPath = joinApiPath(row.base_path, relativePath);
    const target = await getTargetPath({
        serverId: input.serverId,
        root: row.root,
        apiPath: targetApiPath,
    });

    await ensureParentDirsWithOwnership(input.serverId, target.rootDir, target.absPath);
    await assertTargetWritable(target.absPath, overwrite);

    const tempTarget = `${target.absPath}.upload-${crypto.randomUUID()}`;
    try {
        const out = createWriteStream(tempTarget, { flags: 'w' });
        for (let index = 0; index < input.totalChunks; index += 1) {
            await pipeline(createReadStream(path.join(chunksDir, `${index}.part`)), out, { end: false });
        }
        out.end();
        await new Promise<void>((resolve, reject) => {
            out.on('finish', resolve);
            out.on('error', reject);
        });

        const finalStat = await fs.stat(tempTarget);
        if (finalStat.size !== input.fileSize) {
            throw Object.assign(new Error('Assembled file size mismatch'), { statusCode: 400 });
        }

        await fs.rename(tempTarget, target.absPath);
        await safeChown(input.serverId, target.absPath);
        await writeJson(completedPath, { relativePath, targetApiPath, completedAt: nowIso() });
        await fs.rm(chunksDir, { recursive: true, force: true }).catch(() => undefined);
    } catch (error) {
        await fs.rm(tempTarget, { force: true }).catch(() => undefined);
        const message = error instanceof Error ? error.message : 'Upload assembly failed';
        await fileTransferJobRepository.fail(row.id, message);
        throw error;
    }

    fresh = await fileTransferJobRepository.findById(row.id);
    const completedFiles = (fresh?.completed_files ?? row.completed_files) + 1;
    fresh = await fileTransferJobRepository.updateProgress(row.id, {
        completedFiles,
    }) ?? fresh;

    if (fresh && fresh.total_files > 0 && completedFiles >= fresh.total_files && fresh.total_bytes > 0 && fresh.transferred_bytes >= fresh.total_bytes) {
        fresh = await fileTransferJobRepository.complete(row.id) ?? fresh;
        await fs.rm(jobDir(input.serverId, row.id), { recursive: true, force: true }).catch(() => undefined);
    }

    return fresh ? serializeFileTransferJob(fresh) : serializeFileTransferJob(row);
}

export async function directUpload(input: DirectUploadInput) {
    if (input.contentLength < 0 || input.contentLength > SMALL_UPLOAD_LIMIT_BYTES) {
        throw Object.assign(new Error('File is too large for direct upload; use upload sessions'), { statusCode: 413 });
    }

    const target = await getTargetPath({
        serverId: input.serverId,
        root: input.root,
        apiPath: input.path,
    });

    if (target.apiPath === '/') {
        throw Object.assign(new Error('Cannot upload over mount root'), { statusCode: 400 });
    }

    await ensureParentDirsWithOwnership(input.serverId, target.rootDir, target.absPath);
    await assertTargetWritable(target.absPath, input.overwrite);

    const written = await writeStreamToFile({
        stream: input.stream,
        destination: target.absPath,
        maxBytes: SMALL_UPLOAD_LIMIT_BYTES,
    });
    await safeChown(input.serverId, target.absPath);

    return {
        ok: true,
        root: target.root,
        path: target.apiPath,
        size: written,
    };
}

export async function resolveDownloadTarget(params: {
    serverId: number;
    root?: string;
    path?: string;
}): Promise<DownloadTarget> {
    const resolved = await resolveServerPath({
        serverId: params.serverId,
        root: params.root,
        path: params.path || '/',
    });
    const st = await fs.lstat(resolved.absPath).catch(() => null);
    if (!st) throw Object.assign(new Error('Path not found'), { statusCode: 404 });
    if (st.isSymbolicLink()) throw Object.assign(new Error('Symbolic links are not allowed'), { statusCode: 400 });
    await ensureResolvedPathInsideRoot(resolved.absPath, resolved.rootDir);

    if (st.isDirectory()) {
        return {
            root: resolved.root,
            path: resolved.apiPath,
            absPath: resolved.absPath,
            rootDir: resolved.rootDir,
            filename: `${getBasenameFromApiPath(resolved.apiPath === '/' ? resolved.root : resolved.apiPath)}.zip`,
            type: 'dir',
            size: st.size,
        };
    }

    if (!st.isFile()) {
        throw Object.assign(new Error('Path is not a regular file or directory'), { statusCode: 400 });
    }

    const filename = getBasenameFromApiPath(resolved.apiPath);
    return {
        root: resolved.root,
        path: resolved.apiPath,
        absPath: resolved.absPath,
        rootDir: resolved.rootDir,
        filename,
        type: 'file',
        size: st.size,
        contentType: guessContentTypeByName(filename),
    };
}

async function collectZipEntries(params: {
    rootDir: string;
    dirPath: string;
    prefix: string;
}): Promise<Array<{ absPath: string; zipPath: string; type: 'file' | 'dir' }>> {
    const out: Array<{ absPath: string; zipPath: string; type: 'file' | 'dir' }> = [];

    async function walk(absDir: string, zipDir: string): Promise<void> {
        await ensureResolvedPathInsideRoot(absDir, params.rootDir);
        const entries = await fs.readdir(absDir, { withFileTypes: true });
        if (entries.length === 0) {
            out.push({ absPath: absDir, zipPath: `${zipDir.replace(/\/?$/, '/')}`, type: 'dir' });
            return;
        }

        for (const entry of entries) {
            const abs = path.join(absDir, entry.name);
            const st = await fs.lstat(abs);
            if (st.isSymbolicLink()) continue;
            const zipPath = `${zipDir}/${entry.name}`.replace(/^\/+/, '');
            if (st.isDirectory()) {
                await walk(abs, zipPath);
            } else if (st.isFile()) {
                out.push({ absPath: abs, zipPath, type: 'file' });
            }
        }
    }

    await walk(params.dirPath, params.prefix);
    return out;
}

export async function streamDirectoryZip(params: {
    target: DownloadTarget;
    output: NodeJS.WritableStream;
}): Promise<void> {
    await ensureIsDir(params.target.absPath, params.target.rootDir);
    const zip = new yazl.ZipFile();
    const prefix = getBasenameFromApiPath(params.target.path === '/' ? params.target.root : params.target.path);
    const entries = await collectZipEntries({
        rootDir: params.target.rootDir,
        dirPath: params.target.absPath,
        prefix,
    });

    for (const entry of entries) {
        if (entry.type === 'dir') {
            zip.addEmptyDirectory(entry.zipPath);
        } else {
            zip.addFile(entry.absPath, entry.zipPath, { compress: false });
        }
    }

    zip.end({ forceZip64Format: true, comment: '' });
    await pipeline(zip.outputStream, params.output);
}

export async function streamFileDownload(params: {
    target: DownloadTarget;
    output: NodeJS.WritableStream;
}): Promise<void> {
    await ensureIsFile(params.target.absPath, params.target.rootDir);
    await pipeline(createReadStream(params.target.absPath), params.output);
}

export function parseUploadQuery(query: Record<string, unknown>) {
    return {
        root: typeof query.root === 'string' && query.root.trim() ? query.root.trim() : undefined,
        path: typeof query.path === 'string' && query.path.trim() ? query.path.trim() : '',
        overwrite: normalizeOverwrite(query.overwrite),
    };
}

export function parseChunkQuery(query: Record<string, unknown>) {
    return {
        relativePath: typeof query.relativePath === 'string' ? query.relativePath : '',
        chunkIndex: Number.parseInt(String(query.chunkIndex ?? ''), 10),
        totalChunks: Number.parseInt(String(query.totalChunks ?? ''), 10),
        fileSize: Number.parseInt(String(query.fileSize ?? ''), 10),
    };
}
