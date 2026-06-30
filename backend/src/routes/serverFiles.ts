import { Router, type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { listServerFileRoots, listServerFiles } from '../services/fileExplorer.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveServerPath } from '../services/fileExplorer.js';
import { ensureIsDir, ensureResolvedPathInsideRoot } from '../utils/fsBrowser.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { PERMISSIONS } from '../permissions.js';
import {
    boundedInt,
    contentLengthHeader,
    optionalQueryString,
    optionalTrimmedString,
    queryString,
    requireBodyObject,
    requirePositiveInt,
    stringArray,
} from '../utils/httpValidation.js';
import {
    cancelUploadSession,
    completeUploadSession,
    createUploadSession,
    directUpload,
    getFileTransferJob,
    listFileTransferJobs,
    parseChunkQuery,
    parseUploadQuery,
    receiveUploadChunk,
    resolveDownloadTarget,
    SMALL_UPLOAD_LIMIT_BYTES,
    streamDirectoryZip,
    streamFileDownload,
} from '../services/fileTransfers.js';

const router = Router({ mergeParams: true });

function getQueryRoot(value: unknown): string | undefined {
    return optionalQueryString(value as string | string[] | undefined);
}

function getBodyRoot(body: unknown, fallbackKey = 'root'): string | undefined {
    const record = body && typeof body === 'object' && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
    return optionalTrimmedString(record[fallbackKey]);
}

function contentDisposition(filename: string): string {
    const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function handleFileRouteError(
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

// GET /api/servers/:id/files/roots
router.get('/roots', requireServerPermission(PERMISSIONS.fs.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const result = await listServerFileRoots(serverId);
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:FILES:ROOTS',
            fallbackMessage: 'Failed to list file roots',
            logContext: { serverId: req.params.id },
        });
    }
});

// GET /api/servers/:id/files/transfers
router.get('/transfers', requireServerPermission(PERMISSIONS.fs.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const limit = boundedInt(req.query.limit, 20, 1, 100);
        const jobs = await listFileTransferJobs(serverId, limit);
        return res.json({ jobs });
    } catch (error) {
            return handleFileRouteError(res, error, {
                route: 'ROUTE:FILES:TRANSFERS',
                serverId: req.params.id,
                fallbackMessage: 'Failed to list file transfer jobs',
        });
    }
});

// GET /api/servers/:id/files/transfers/:jobId
router.get('/transfers/:jobId', requireServerPermission(PERMISSIONS.fs.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const jobId = requirePositiveInt(req.params.jobId, 'Invalid transfer job id');

        const job = await getFileTransferJob(serverId, jobId);
        return res.json({ job });
    } catch (error) {
        return handleFileRouteError(res, error, {
            route: 'ROUTE:FILES:TRANSFER_GET',
            serverId: req.params.id,
            fallbackMessage: 'Failed to get file transfer job',
        });
    }
});

// GET /api/servers/:id/files/download
router.get('/download', requireServerPermission(PERMISSIONS.fs.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const target = await resolveDownloadTarget({
            serverId,
            root: getQueryRoot(req.query.root),
            path: queryString(req.query.path, '/'),
        });

        res.setHeader('Content-Disposition', contentDisposition(target.filename));

        if (target.type === 'file') {
            res.setHeader('Content-Type', target.contentType ?? 'application/octet-stream');
            res.setHeader('Content-Length', String(target.size));
            await streamFileDownload({ target, output: res });
            return;
        }

        res.setHeader('Content-Type', 'application/zip');
        await streamDirectoryZip({ target, output: res });
    } catch (error) {
        return handleFileRouteError(res, error, {
            route: 'ROUTE:FILES:DOWNLOAD',
            serverId: req.params.id,
            fallbackMessage: 'Failed to download file',
        });
    }
});

// PUT /api/servers/:id/files/upload
router.put('/upload', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const parsed = parseUploadQuery(req.query as Record<string, unknown>);
        if (!parsed.path) return res.status(400).json({ error: 'Missing path' });

        const contentLength = contentLengthHeader(req.headers['content-length']);
        if (contentLength > SMALL_UPLOAD_LIMIT_BYTES) {
            return res.status(413).json({ error: 'File is too large for direct upload; use upload sessions' });
        }

        const result = await directUpload({
            serverId,
            root: parsed.root,
            path: parsed.path,
            overwrite: parsed.overwrite,
            stream: req,
            contentLength,
        });
        return res.status(201).json(result);
    } catch (error) {
        return handleFileRouteError(res, error, {
            route: 'ROUTE:FILES:UPLOAD_DIRECT',
            serverId: req.params.id,
            fallbackMessage: 'Failed to upload file',
        });
    }
});

// POST /api/servers/:id/files/upload-sessions
router.post('/upload-sessions', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
        const body = requireBodyObject(req.body);

        const job = await createUploadSession({
            serverId,
            root: getBodyRoot(body),
            path: typeof body.path === 'string' ? body.path : '/',
            totalBytes: Number(body.totalBytes ?? 0),
            totalFiles: Number(body.totalFiles ?? 0),
            overwrite: body.overwrite === true,
        });

        return res.status(201).json({ upload: job });
    } catch (error) {
        return handleFileRouteError(res, error, {
            route: 'ROUTE:FILES:UPLOAD_SESSION_CREATE',
            serverId: req.params.id,
            fallbackMessage: 'Failed to create upload session',
        });
    }
});

// PUT /api/servers/:id/files/upload-sessions/:uploadId/chunks
router.put('/upload-sessions/:uploadId/chunks', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const uploadId = requirePositiveInt(req.params.uploadId, 'Invalid upload id');

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
        return handleFileRouteError(res, error, {
            route: 'ROUTE:FILES:UPLOAD_CHUNK',
            serverId: req.params.id,
            fallbackMessage: 'Failed to upload file chunk',
        });
    }
});

// POST /api/servers/:id/files/upload-sessions/:uploadId/complete
router.post('/upload-sessions/:uploadId/complete', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const uploadId = requirePositiveInt(req.params.uploadId, 'Invalid upload id');

        const job = await completeUploadSession(serverId, uploadId);
        return res.json({ upload: job });
    } catch (error) {
        return handleFileRouteError(res, error, {
            route: 'ROUTE:FILES:UPLOAD_COMPLETE',
            serverId: req.params.id,
            fallbackMessage: 'Failed to complete upload session',
        });
    }
});

// DELETE /api/servers/:id/files/upload-sessions/:uploadId
router.delete('/upload-sessions/:uploadId', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const uploadId = requirePositiveInt(req.params.uploadId, 'Invalid upload id');

        const job = await cancelUploadSession(serverId, uploadId);
        return res.json({ upload: job });
    } catch (error) {
        return handleFileRouteError(res, error, {
            route: 'ROUTE:FILES:UPLOAD_CANCEL',
            serverId: req.params.id,
            fallbackMessage: 'Failed to cancel upload session',
        });
    }
});

// GET /api/servers/:id/files
router.get('/', requireServerPermission(PERMISSIONS.fs.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const path = queryString(req.query.path, '/');
        const root = getQueryRoot(req.query.root);

        const result = await listServerFiles({ serverId, root, path });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:FILES:LIST',
            fallbackMessage: 'Failed to list files',
            logContext: { serverId: req.params.id },
        });
    }
});

// POST /api/servers/:id/files/mkdir
router.post('/mkdir', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
        const body = requireBodyObject(req.body);

        const basePath = typeof body.path === 'string' ? body.path : '/';
        const root = getBodyRoot(body);
        const name = optionalTrimmedString(body.name);
        if (!name) return res.status(400).json({ error: 'Missing name' });
        if (name.includes('/') || name.includes('\\') || name.includes('..')) {
            return res.status(400).json({ error: 'Invalid folder name' });
        }

        const resolvedBase = await resolveServerPath({ serverId, root, path: basePath });
        await ensureIsDir(resolvedBase.absPath, resolvedBase.rootDir);

        const target = path.join(resolvedBase.absPath, name);
        await fs.mkdir(target, { recursive: false });

        return res.json({ ok: true });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:FILES:MKDIR',
            fallbackMessage: 'Failed to mkdir',
            logContext: { serverId: req.params.id },
        });
    }
});

// POST /api/servers/:id/files/touch
router.post('/touch', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
        const body = requireBodyObject(req.body);

        const basePath = typeof body.path === 'string' ? body.path : '/';
        const root = getBodyRoot(body);
        const name = optionalTrimmedString(body.name);
        const content = typeof body.content === 'string' ? body.content : '';

        if (!name) return res.status(400).json({ error: 'Missing name' });
        if (name.includes('/') || name.includes('\\') || name.includes('..')) {
            return res.status(400).json({ error: 'Invalid file name' });
        }

        const resolvedBase = await resolveServerPath({ serverId, root, path: basePath });
        await ensureIsDir(resolvedBase.absPath, resolvedBase.rootDir);

        const target = path.join(resolvedBase.absPath, name);

        const exists = await fs.stat(target).then(() => true).catch(() => false);
        if (exists) {
            return res.status(409).json({ error: 'File already exists' });
        }

        if (content.length > 2_000_000) {
            return res.status(413).json({ error: 'File too large' });
        }

        await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });

        return res.status(201).json({ ok: true });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:FILES:TOUCH',
            fallbackMessage: 'Failed to create file',
            logContext: { serverId: req.params.id },
        });
    }
});

// POST /api/servers/:id/files/rename
router.post('/rename', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
        const body = requireBodyObject(req.body);

        const from = typeof body.from === 'string' ? body.from : '';
        const to = typeof body.to === 'string' ? body.to : '';
        const root = getBodyRoot(body);
        const fromRoot = getBodyRoot(body, 'fromRoot') ?? root;
        const toRoot = getBodyRoot(body, 'toRoot') ?? root;
        if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

        const absFrom = await resolveServerPath({ serverId, root: fromRoot, path: from });
        const absTo = await resolveServerPath({ serverId, root: toRoot, path: to });
        if (absFrom.apiPath === '/') {
            return res.status(400).json({ error: 'Cannot rename mount root' });
        }
        if (absTo.apiPath === '/') {
            return res.status(400).json({ error: 'Cannot replace mount root' });
        }

        await ensureResolvedPathInsideRoot(absFrom.absPath, absFrom.rootDir);

        const fromStat = await fs.lstat(absFrom.absPath).catch(() => null);
        if (!fromStat) return res.status(404).json({ error: 'Path not found' });
        if (fromStat.isSymbolicLink()) {
            return res.status(400).json({ error: 'Symbolic links are not allowed' });
        }

        const toParent = path.dirname(absTo.absPath);
        await ensureIsDir(toParent, absTo.rootDir);

        await fs.rename(absFrom.absPath, absTo.absPath);
        return res.json({ ok: true });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:FILES:RENAME',
            fallbackMessage: 'Failed to rename',
            logContext: { serverId: req.params.id },
        });
    }
});

// POST /api/servers/:id/files/delete
router.post('/delete', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
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
        const root = getBodyRoot(body);

        // Best effort delete all
        for (const p of paths) {
            const apiPath = String(p ?? '');
            if (!apiPath) continue;

            const resolved = await resolveServerPath({ serverId, root, path: apiPath });
            if (resolved.apiPath === '/') {
                return res.status(400).json({ error: 'Cannot delete mount root' });
            }

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
        return sendRouteError(res, error, {
            route: 'ROUTE:FILES:DELETE',
            fallbackMessage: 'Failed to delete',
            logContext: { serverId: req.params.id },
        });
    }
});

export default router;
