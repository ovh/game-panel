import { Router, type Response } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { getServerOrThrow } from '../services/servers.js';
import { listServerFiles, resolveServerPath } from '../services/fileExplorer.js';
import {
    cancelUploadSession,
    completeUploadSession,
    createUploadSession,
    directUpload,
    getFileTransferJob,
    parseChunkQuery,
    parseUploadQuery,
    receiveUploadChunk,
    SMALL_UPLOAD_LIMIT_BYTES,
} from '../services/fileTransfers.js';
import { ensureIsDir, ensureResolvedPathInsideRoot } from '../utils/fsBrowser.js';
import { sendRouteError } from '../utils/routeErrors.js';
import type { GameServerRow } from '../types/gameServer.js';
import {
    contentLengthHeader,
    optionalTrimmedString,
    queryString,
    requireBodyObject,
    requirePositiveInt,
    stringArray,
} from '../utils/httpValidation.js';

type ScopedFileArea = {
    root: string;
    basePath: string;
    kind?: string;
};

type CreateScopedFileAreaRouterOptions = {
    permissions: {
        read: string;
        write: string;
    };
    resolveArea: (server: GameServerRow) => ScopedFileArea;
    routeName: string;
};

function handleRouteError(
    res: Response,
    error: unknown,
    context: {
        route: string;
        serverId: string | undefined;
        fallbackMessage: string;
    }
) {
    if (res.headersSent) return res.end();
    return sendRouteError(res, error, {
        route: context.route,
        fallbackMessage: context.fallbackMessage,
        logContext: { serverId: context.serverId },
    });
}

function normalizeApiPath(value: unknown): string {
    const raw = String(value ?? '/').trim();
    if (!raw) return '/';

    let normalized = raw.startsWith('/') ? raw : `/${raw}`;
    normalized = path.posix.normalize(normalized);
    if (normalized === '.') normalized = '/';
    if (!normalized.startsWith('/')) normalized = `/${normalized}`;

    if (normalized.includes('\0') || normalized.includes('..')) {
        throw Object.assign(new Error('Invalid path'), { statusCode: 400 });
    }

    return normalized;
}

function joinAreaPath(basePath: string, rawPath: unknown): string {
    const base = normalizeApiPath(basePath);
    const child = normalizeApiPath(rawPath);
    if (child === '/') return base;

    const joined = path.posix.normalize(path.posix.join(base, child));
    const basePrefix = base.endsWith('/') ? base : `${base}/`;

    if (joined !== base && !joined.startsWith(basePrefix)) {
        throw Object.assign(new Error('Invalid path'), { statusCode: 400 });
    }

    return joined;
}

function toAreaPath(basePath: string, fullPath: string): string {
    const base = normalizeApiPath(basePath);
    const normalized = normalizeApiPath(fullPath);
    if (normalized === base) return '/';

    const basePrefix = base.endsWith('/') ? base : `${base}/`;
    if (!normalized.startsWith(basePrefix)) return normalized;

    const relative = normalized.slice(base.length);
    return relative.startsWith('/') ? relative : `/${relative}`;
}

function isPathInsideArea(basePath: string, fullPath: string): boolean {
    const base = normalizeApiPath(basePath);
    const normalized = normalizeApiPath(fullPath);
    const basePrefix = base.endsWith('/') ? base : `${base}/`;
    return normalized === base || normalized.startsWith(basePrefix);
}

function assertTransferJobInArea(job: any, area: ScopedFileArea): void {
    if (job.root !== area.root || !isPathInsideArea(area.basePath, job.basePath)) {
        throw Object.assign(new Error('File transfer job is not part of this file area'), { statusCode: 404 });
    }
}

function getQueryPath(value: unknown): string {
    return queryString(value, '/');
}

function getBodyPath(body: unknown): string {
    const record = body && typeof body === 'object' && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
    return optionalTrimmedString(record.path) ?? '/';
}

async function getScopedArea(params: {
    serverId: number;
    resolveArea: (server: GameServerRow) => ScopedFileArea;
}): Promise<{ server: GameServerRow; area: ScopedFileArea }> {
    const server = await getServerOrThrow(params.serverId);
    const area = params.resolveArea(server);
    return { server, area };
}

async function ensureAreaRootExists(serverId: number, area: ScopedFileArea): Promise<void> {
    const root = await resolveServerPath({
        serverId,
        root: area.root,
        path: area.basePath,
    });
    await ensureIsDir(root.absPath, root.rootDir);
}

export function createScopedFileAreaRouter(options: CreateScopedFileAreaRouterOptions): Router {
    const router = Router({ mergeParams: true });

    // GET /api/servers/:id/<scoped-area>
    router.get('/', requireServerPermission(options.permissions.read), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const { area } = await getScopedArea({ serverId, resolveArea: options.resolveArea });
            const result = await listServerFiles({
                serverId,
                root: area.root,
                path: joinAreaPath(area.basePath, getQueryPath(req.query.path)),
            });

            return res.json({
                kind: area.kind ?? null,
                path: toAreaPath(area.basePath, result.path),
                entries: result.entries,
            });
        } catch (error) {
            return handleRouteError(res, error, {
                route: `${options.routeName}:LIST`,
                serverId: req.params.id,
                fallbackMessage: 'Failed to list files',
            });
        }
    });

    // GET /api/servers/:id/<scoped-area>/transfers/:jobId
    router.get('/transfers/:jobId', requireServerPermission(options.permissions.read), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const jobId = requirePositiveInt(req.params.jobId, 'Invalid transfer job id');

            const { area } = await getScopedArea({ serverId, resolveArea: options.resolveArea });
            const job = await getFileTransferJob(serverId, jobId);
            assertTransferJobInArea(job, area);
            return res.json({ job });
        } catch (error) {
            return handleRouteError(res, error, {
                route: `${options.routeName}:TRANSFER_GET`,
                serverId: req.params.id,
                fallbackMessage: 'Failed to get file transfer job',
            });
        }
    });

    // PUT /api/servers/:id/<scoped-area>/upload
    router.put('/upload', requireServerPermission(options.permissions.write), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const { area } = await getScopedArea({ serverId, resolveArea: options.resolveArea });
            await ensureAreaRootExists(serverId, area);

            const parsed = parseUploadQuery(req.query as Record<string, unknown>);
            if (!parsed.path) return res.status(400).json({ error: 'Missing path' });

            const contentLength = contentLengthHeader(req.headers['content-length']);
            if (contentLength > SMALL_UPLOAD_LIMIT_BYTES) {
                return res.status(413).json({ error: 'File is too large for direct upload; use upload sessions' });
            }

            const result = await directUpload({
                serverId,
                root: area.root,
                path: joinAreaPath(area.basePath, parsed.path),
                overwrite: parsed.overwrite,
                stream: req,
                contentLength,
            });

            return res.status(201).json({
                ...result,
                path: toAreaPath(area.basePath, result.path),
            });
        } catch (error) {
            return handleRouteError(res, error, {
                route: `${options.routeName}:UPLOAD_DIRECT`,
                serverId: req.params.id,
                fallbackMessage: 'Failed to upload file',
            });
        }
    });

    // POST /api/servers/:id/<scoped-area>/upload-sessions
    router.post('/upload-sessions', requireServerPermission(options.permissions.write), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
            const body = requireBodyObject(req.body);

            const { area } = await getScopedArea({ serverId, resolveArea: options.resolveArea });
            const job = await createUploadSession({
                serverId,
                root: area.root,
                path: joinAreaPath(area.basePath, getBodyPath(body)),
                totalBytes: Number(body.totalBytes ?? 0),
                totalFiles: Number(body.totalFiles ?? 0),
                overwrite: body.overwrite === true,
            });

            return res.status(201).json({ upload: job });
        } catch (error) {
            return handleRouteError(res, error, {
                route: `${options.routeName}:UPLOAD_SESSION_CREATE`,
                serverId: req.params.id,
                fallbackMessage: 'Failed to create upload session',
            });
        }
    });

    // PUT /api/servers/:id/<scoped-area>/upload-sessions/:uploadId/chunks
    router.put('/upload-sessions/:uploadId/chunks', requireServerPermission(options.permissions.write), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const uploadId = requirePositiveInt(req.params.uploadId, 'Invalid upload id');

            const { area } = await getScopedArea({ serverId, resolveArea: options.resolveArea });
            assertTransferJobInArea(await getFileTransferJob(serverId, uploadId), area);
            const parsed = parseChunkQuery(req.query as Record<string, unknown>);
            const job = await receiveUploadChunk({
                serverId,
                uploadId,
                relativePath: parsed.relativePath,
                chunkIndex: parsed.chunkIndex,
                totalChunks: parsed.totalChunks,
                fileSize: parsed.fileSize,
                stream: req,
                contentLength: contentLengthHeader(req.headers['content-length']),
            });

            return res.json({ upload: job });
        } catch (error) {
            return handleRouteError(res, error, {
                route: `${options.routeName}:UPLOAD_CHUNK`,
                serverId: req.params.id,
                fallbackMessage: 'Failed to upload file chunk',
            });
        }
    });

    // POST /api/servers/:id/<scoped-area>/upload-sessions/:uploadId/complete
    router.post('/upload-sessions/:uploadId/complete', requireServerPermission(options.permissions.write), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const uploadId = requirePositiveInt(req.params.uploadId, 'Invalid upload id');

            const { area } = await getScopedArea({ serverId, resolveArea: options.resolveArea });
            assertTransferJobInArea(await getFileTransferJob(serverId, uploadId), area);
            const job = await completeUploadSession(serverId, uploadId);
            return res.json({ upload: job });
        } catch (error) {
            return handleRouteError(res, error, {
                route: `${options.routeName}:UPLOAD_COMPLETE`,
                serverId: req.params.id,
                fallbackMessage: 'Failed to complete upload session',
            });
        }
    });

    // DELETE /api/servers/:id/<scoped-area>/upload-sessions/:uploadId
    router.delete('/upload-sessions/:uploadId', requireServerPermission(options.permissions.write), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const uploadId = requirePositiveInt(req.params.uploadId, 'Invalid upload id');

            const { area } = await getScopedArea({ serverId, resolveArea: options.resolveArea });
            assertTransferJobInArea(await getFileTransferJob(serverId, uploadId), area);
            const job = await cancelUploadSession(serverId, uploadId);
            return res.json({ upload: job });
        } catch (error) {
            return handleRouteError(res, error, {
                route: `${options.routeName}:UPLOAD_CANCEL`,
                serverId: req.params.id,
                fallbackMessage: 'Failed to cancel upload session',
            });
        }
    });

    // DELETE /api/servers/:id/<scoped-area>
    router.delete('/', requireServerPermission(options.permissions.write), async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
            const body = requireBodyObject(req.body);

            const paths = Array.isArray(body.paths) ? stringArray(body.paths, 'paths must be an array of strings') : [];
            if (paths.length === 0) {
                return res.status(400).json({ error: 'Missing paths' });
            }
            if (paths.length > 50) {
                return res.status(400).json({ error: 'Too many paths' });
            }

            const { area } = await getScopedArea({ serverId, resolveArea: options.resolveArea });
            await ensureAreaRootExists(serverId, area);

            for (const rawPath of paths) {
                const areaPath = normalizeApiPath(rawPath);
                if (areaPath === '/') return res.status(400).json({ error: 'Cannot delete area root' });

                const resolved = await resolveServerPath({
                    serverId,
                    root: area.root,
                    path: joinAreaPath(area.basePath, areaPath),
                });

                const st = await fs.lstat(resolved.absPath).catch(() => null);
                if (!st) continue;
                if (st.isSymbolicLink()) {
                    return res.status(400).json({ error: 'Symbolic links are not allowed' });
                }

                await ensureResolvedPathInsideRoot(resolved.absPath, resolved.rootDir);
                await fs.rm(resolved.absPath, { recursive: true, force: true });
            }

            return res.json({ ok: true });
        } catch (error) {
            return handleRouteError(res, error, {
                route: `${options.routeName}:DELETE`,
                serverId: req.params.id,
                fallbackMessage: 'Failed to delete files',
            });
        }
    });

    return router;
}
