import { Router, type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { resolveServerPath } from '../services/fileExplorer.js';
import { ensureIsFile, getBasenameFromApiPath, guessContentTypeByName } from '../utils/fsBrowser.js';
import { promises as fs } from 'node:fs';
import { sendRouteError } from '../utils/routeErrors.js';
import { PERMISSIONS } from '../permissions.js';
import {
    optionalQueryString,
    requireBodyObject,
    requirePositiveInt,
    requireString,
} from '../utils/httpValidation.js';

const MAX_INLINE_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const router = Router({ mergeParams: true });

function getQueryRoot(value: unknown): string | undefined {
    return optionalQueryString(value as string | string[] | undefined);
}

// GET /api/servers/:id/file
router.get('/', requireServerPermission(PERMISSIONS.fs.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const apiPath = optionalQueryString(req.query.path) ?? '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });

        const root = getQueryRoot(req.query.root);

        const resolved = await resolveServerPath({ serverId, root, path: apiPath });
        await ensureIsFile(resolved.absPath, resolved.rootDir);

        const filename = getBasenameFromApiPath(resolved.apiPath);

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
        return res.sendFile(resolved.absPath, { dotfiles: 'allow' });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:FILE:READ',
            fallbackMessage: 'Failed to read file',
            logContext: { serverId: req.params.id },
        });
    }
});

// PUT /api/servers/:id/file
router.put('/', requireServerPermission(PERMISSIONS.fs.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const apiPath = optionalQueryString(req.query.path) ?? '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });
        const root = getQueryRoot(req.query.root);
        const body = requireBodyObject(req.body);

        const content = requireString(body.content, 'Missing content');

        const resolved = await resolveServerPath({ serverId, root, path: apiPath });
        await ensureIsFile(resolved.absPath, resolved.rootDir);

        // Basic size guard (V1)
        if (content.length > 2_000_000) {
            return res.status(413).json({ error: 'File too large' });
        }

        await fs.writeFile(resolved.absPath, content, { encoding: 'utf8' });
        return res.json({ ok: true });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:FILE:WRITE',
            fallbackMessage: 'Failed to write file',
            logContext: { serverId: req.params.id },
        });
    }
});

export default router;
