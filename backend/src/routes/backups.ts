import { Router, type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { parseServerId } from './servers.js';
import { getBackupSettings, setBackupSettings } from '../services/backupSettings.js';
import { getBackupCron, setBackupCron } from '../services/backupCron.js';
import { listServerFiles, resolveServerPath } from '../services/fileExplorer.js';
import { ensureIsFile, getBasenameFromApiPath, guessContentTypeByName } from '../utils/fsBrowser.js';
import { promises as fs } from 'node:fs';
import { getServerOrThrow } from '../services/servers.js';
import { actionsRepository } from '../database/index.js';
import * as dockerUtils from '../utils/docker.js';
import { logError } from '../utils/logger.js';

const router = Router({ mergeParams: true });

// GET /api/servers/:id/backups/
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const path = typeof req.query.path === 'string' ? req.query.path : '/';

        const result = await listServerFiles({ serverId, path, root: 'backup' });

        // Optional: filter to show only tar.zst
        result.entries = result.entries.filter((e: any) => e.type === 'file' && e.name.endsWith('.tar.zst'));

        return res.json(result);
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to list backups'
            : (error instanceof Error ? error.message : 'Failed to list backups');
        if (statusCode >= 500) logError('ROUTE:BACKUPS:LIST', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

// GET /api/servers/:id/backups/file?path=/server-xxx.tar.zst
// GET /api/servers/:id/backups/file?path=/server-xxx.tar.zst&download=1
router.get('/file', requireServerPermission('backups.download'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const apiPath = typeof req.query.path === 'string' ? req.query.path : '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });

        const download = String(req.query.download ?? '') === '1';

        const resolved = await resolveServerPath({ serverId, path: apiPath, root: 'backup' });
        await ensureIsFile(resolved.absPath, resolved.rootDir);

        const filename = getBasenameFromApiPath(resolved.apiPath);

        if (download) return res.download(resolved.absPath, filename);

        res.setHeader('Content-Type', guessContentTypeByName(filename));
        return res.sendFile(resolved.absPath);
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to read backup file'
            : (error instanceof Error ? error.message : 'Failed to read backup file');
        if (statusCode >= 500) logError('ROUTE:BACKUPS:FILE_READ', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

// GET /api/servers/:id/backups/settings
router.get('/settings', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        res.json(await getBackupSettings(serverId));
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to read backup settings'
            : (error instanceof Error ? error.message : 'Failed to read backup settings');
        if (statusCode >= 500) logError('ROUTE:BACKUPS:SETTINGS_READ', error, { serverId: req.params.id });
        res.status(statusCode).json({ error: message });
    }
});

// POST /api/servers/:id/backups/create
router.post(
    '/create',
    requireServerPermission('backups.create'),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = parseServerId(req.params.id);
            if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

            const server = await getServerOrThrow(serverId);

            await actionsRepository.create(serverId, 'info', 'Backup requested', req.user?.username || "");

            const { exitCode, stdout, stderr } = await dockerUtils.execShellCommand(
                server.docker_container_id,
                `/app/${server.game_server_name} backup`,
                { user: 'linuxgsm', workdir: '/app' }
            );

            const ok = exitCode === 0;

            await actionsRepository.create(
                serverId,
                ok ? 'success' : 'error',
                ok ? 'Backup completed' : `Backup failed (exitCode=${exitCode})`,
                req.user?.username || ""
            );

            return res.json({ ok, exitCode, stdout, stderr });
        } catch (error) {
            const statusCode = (error as any)?.statusCode ?? 500;
            const message = statusCode >= 500
                ? 'Backup failed'
                : (error instanceof Error ? error.message : 'Backup failed');
            if (statusCode >= 500) logError('ROUTE:BACKUPS:CREATE', error, { serverId: req.params.id });
            return res.status(statusCode).json({ error: message });
        }
    }
);

// PATCH /api/servers/:id/backups/settings
router.patch('/settings', requireServerPermission('backups.settings.write'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const { maxbackups, maxbackupdays, stoponbackup } = req.body ?? {};

        await setBackupSettings(serverId, {
            ...(maxbackups !== undefined ? { maxbackups: Number(maxbackups) } : {}),
            ...(maxbackupdays !== undefined ? { maxbackupdays: Number(maxbackupdays) } : {}),
            ...(stoponbackup !== undefined ? { stoponbackup: Boolean(stoponbackup) } : {}),
        });

        const fresh = await getBackupSettings(serverId);
        res.json(fresh);
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to update backup settings'
            : (error instanceof Error ? error.message : 'Failed to update backup settings');
        if (statusCode >= 500) logError('ROUTE:BACKUPS:SETTINGS_WRITE', error, { serverId: req.params.id });
        res.status(statusCode).json({ error: message });
    }
});

// GET /api/servers/:id/backups/cron
router.get('/cron', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const result = await getBackupCron(serverId);
        return res.json(result);
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to read cron'
            : (error instanceof Error ? error.message : 'Failed to read cron');
        if (statusCode >= 500) logError('ROUTE:BACKUPS:CRON_READ', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

// PATCH /api/servers/:id/backups/cron
router.patch('/cron', requireServerPermission('backups.settings.write'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const enabled = Boolean(req.body?.enabled);

        if (!enabled) {
            await setBackupCron(serverId, { enabled: false });
            return res.json({ enabled: false });
        }

        const schedule = typeof req.body?.schedule === 'string' ? req.body.schedule : '';
        await setBackupCron(serverId, { enabled: true, schedule });

        // Return updated state
        const fresh = await getBackupCron(serverId);
        return res.json(fresh);
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to update cron'
            : (error instanceof Error ? error.message : 'Failed to update cron');
        if (statusCode >= 500) logError('ROUTE:BACKUPS:CRON_WRITE', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

// DELETE /api/servers/:id/backups/file?path=/server-xxx.tar.zst
router.delete('/file', requireServerPermission('backups.delete'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const apiPath = typeof req.query.path === 'string' ? req.query.path : '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });

        const resolved = await resolveServerPath({ serverId, path: apiPath, root: 'backup' });
        await ensureIsFile(resolved.absPath, resolved.rootDir);

        await fs.unlink(resolved.absPath);

        return res.json({ success: true });
    } catch (error) {
        const statusCode = (error as any)?.statusCode ?? 500;
        const message = statusCode >= 500
            ? 'Failed to delete backup'
            : (error instanceof Error ? error.message : 'Failed to delete backup');
        if (statusCode >= 500) logError('ROUTE:BACKUPS:DELETE', error, { serverId: req.params.id });
        return res.status(statusCode).json({ error: message });
    }
});

export default router;
