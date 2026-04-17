import { Router, type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { resolveServerPath } from '../services/fileExplorer.js';
import { ensureIsFile, getBasenameFromApiPath, guessContentTypeByName } from '../utils/fsBrowser.js';
import { promises as fs } from 'node:fs';
import { parsePositiveIntId } from '../utils/ids.js';
import { logError } from '../utils/logger.js';

const MAX_INLINE_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const router = Router({ mergeParams: true });

/**
 * GET /api/servers/:id/file?path=/...            -> open/inline
 * GET /api/servers/:id/file?path=/...&download=1 -> download
 */
router.get('/', requireServerPermission('fs.read'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parsePositiveIntId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const apiPath = typeof req.query.path === 'string' ? req.query.path : '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });

        const download = String(req.query.download ?? '') === '1';

        const resolved = await resolveServerPath({ serverId, path: apiPath });
        await ensureIsFile(resolved.absPath, resolved.rootDir);

        const filename = getBasenameFromApiPath(resolved.apiPath);

        if (download) {
            return res.download(resolved.absPath, filename);
        }

        const stat = await fs.stat(resolved.absPath);
        if (stat.size > MAX_INLINE_FILE_SIZE) {
            return res.status(413).json({
                error: 'File too large to display',
                maxInlineSize: MAX_INLINE_FILE_SIZE,
                size: stat.size,
                hint: 'Use download instead',
            });
        }

        // Inline/open
        res.setHeader('Content-Type', guessContentTypeByName(filename));
        return res.sendFile(resolved.absPath);
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to read file'
            : (error instanceof Error ? error.message : 'Failed to read file');
        if (statusCode >= 500) logError('ROUTE:FILE:READ', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

/**
 * PUT /api/servers/:id/file?path=/...
 * Body: { content: string }
 */
router.put('/', requireServerPermission('fs.write'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parsePositiveIntId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const apiPath = typeof req.query.path === 'string' ? req.query.path : '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });

        const content = (req.body as any)?.content;
        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'Missing content' });
        }

        const resolved = await resolveServerPath({ serverId, path: apiPath });
        await ensureIsFile(resolved.absPath, resolved.rootDir);

        // Basic size guard (V1)
        if (content.length > 2_000_000) {
            return res.status(413).json({ error: 'File too large' });
        }

        await fs.writeFile(resolved.absPath, content, { encoding: 'utf8' });
        return res.json({ ok: true });
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to write file'
            : (error instanceof Error ? error.message : 'Failed to write file');
        if (statusCode >= 500) logError('ROUTE:FILE:WRITE', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

export default router;
