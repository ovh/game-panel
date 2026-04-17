import { Router, type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { listServerFiles } from '../services/fileExplorer.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveServerPath } from '../services/fileExplorer.js';
import { ensureIsDir, ensureResolvedPathInsideRoot } from '../utils/fsBrowser.js';
import { parsePositiveIntId } from '../utils/ids.js';
import { logError } from '../utils/logger.js';

const router = Router({ mergeParams: true });

/**
 * GET /api/servers/:id/files?path=/
 * GET /api/servers/:id/files?path=/serverfiles
 */
router.get('/', requireServerPermission('fs.read'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parsePositiveIntId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const path = typeof req.query.path === 'string' ? req.query.path : '/';

        const result = await listServerFiles({ serverId, path });
        return res.json(result);
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to list files'
            : (error instanceof Error ? error.message : 'Failed to list files');

        if (statusCode >= 500) logError('ROUTE:FILES:LIST', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

router.post('/mkdir', requireServerPermission('fs.write'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parsePositiveIntId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const basePath = String((req.body as any)?.path ?? '/');
        const name = String((req.body as any)?.name ?? '').trim();
        if (!name) return res.status(400).json({ error: 'Missing name' });
        if (name.includes('/') || name.includes('\\') || name.includes('..')) {
            return res.status(400).json({ error: 'Invalid folder name' });
        }

        const resolvedBase = await resolveServerPath({ serverId, path: basePath });
        await ensureIsDir(resolvedBase.absPath, resolvedBase.rootDir);

        const target = path.join(resolvedBase.absPath, name);
        await fs.mkdir(target, { recursive: false });

        return res.json({ ok: true });
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to mkdir'
            : (error instanceof Error ? error.message : 'Failed to mkdir');
        if (statusCode >= 500) logError('ROUTE:FILES:MKDIR', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

router.post('/touch', requireServerPermission('fs.write'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parsePositiveIntId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const basePath = String((req.body as any)?.path ?? '/');
        const name = String((req.body as any)?.name ?? '').trim();
        const content = String((req.body as any)?.content ?? '');

        if (!name) return res.status(400).json({ error: 'Missing name' });
        if (name.includes('/') || name.includes('\\') || name.includes('..')) {
            return res.status(400).json({ error: 'Invalid file name' });
        }

        const resolvedBase = await resolveServerPath({ serverId, path: basePath });
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
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to create file'
            : (error instanceof Error ? error.message : 'Failed to create file');
        if (statusCode >= 500) logError('ROUTE:FILES:TOUCH', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

router.post('/rename', requireServerPermission('fs.write'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parsePositiveIntId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const from = String((req.body as any)?.from ?? '');
        const to = String((req.body as any)?.to ?? '');
        if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

        const absFrom = await resolveServerPath({ serverId, path: from });
        const absTo = await resolveServerPath({ serverId, path: to });

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
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to rename'
            : (error instanceof Error ? error.message : 'Failed to rename');
        if (statusCode >= 500) logError('ROUTE:FILES:RENAME', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

router.post('/delete', requireServerPermission('fs.write'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parsePositiveIntId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const paths = (req.body as any)?.paths;
        if (!Array.isArray(paths) || paths.length === 0) {
            return res.status(400).json({ error: 'Missing paths' });
        }
        if (paths.length > 50) {
            return res.status(400).json({ error: 'Too many paths' });
        }

        // Best effort delete all
        for (const p of paths) {
            const apiPath = String(p ?? '');
            if (!apiPath) continue;

            const resolved = await resolveServerPath({ serverId, path: apiPath });
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
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to delete'
            : (error instanceof Error ? error.message : 'Failed to delete');
        if (statusCode >= 500) logError('ROUTE:FILES:DELETE', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

export default router;
