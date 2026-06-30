import { Router, type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { getBackupSettings, setBackupSettings } from '../services/backupSettings.js';
import { listServerFiles, resolveServerPath } from '../services/fileExplorer.js';
import { ensureIsFile, getBasenameFromApiPath, guessContentTypeByName } from '../utils/fsBrowser.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getServerOrThrow } from '../services/servers.js';
import { actionsRepository } from '../database/index.js';
import { sendRouteError } from '../utils/routeErrors.js';
import {
    optionalNumber,
    optionalQueryString,
    optionalBoolean,
    requireBodyObject,
    requirePositiveInt,
} from '../utils/httpValidation.js';
import {
    assertSupportedBackupArchive,
    createServerBackup,
    getBackupFileLocation,
    getSupportedBackupExtensions,
    restoreOvhcloudBackup,
} from '../services/serverBackups.js';
import { PERMISSIONS } from '../permissions.js';

const router = Router({ mergeParams: true });

function joinApiPath(basePath: string, apiPath: string): string {
    const base = basePath.replace(/\/+$/, '') || '/';
    const child = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    if (base === '/') return child;
    return `${base}${child}`;
}

function normalizeBackupFilename(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const name = value.trim();
    if (!name || name.includes('\0')) return null;
    if (name.includes('/') || name.includes('\\')) return null;
    if (name === '.' || name === '..') return null;
    if (path.posix.basename(name) !== name) return null;

    return name;
}

// GET /api/servers/:id/backups
router.get('/', requireServerPermission(PERMISSIONS.backups.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const server = await getServerOrThrow(serverId);
        const extensions = getSupportedBackupExtensions(server);
        const location = getBackupFileLocation(server);

        let result;
        try {
            result = await listServerFiles({
                serverId,
                path: joinApiPath(location.basePath, '/'),
                root: location.root,
            });
        } catch (error: any) {
            if (server.provider === 'ovhcloud' && error?.statusCode === 404) {
                return res.json({
                    root: location.root,
                    path: '/',
                    entries: [],
                    roots: [],
                });
            }
            throw error;
        }

        result.entries = result.entries.filter((e: any) => (
            e.type === 'file' && extensions.some((extension) => e.name.endsWith(extension))
        ));
        result.path = '/';

        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:BACKUPS:LIST',
            fallbackMessage: 'Failed to list backups',
            logContext: { serverId: req.params.id },
        });
    }
});

// GET /api/servers/:id/backups/file
router.get('/file', requireServerPermission(PERMISSIONS.backups.download), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const apiPath = optionalQueryString(req.query.path) ?? '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });

        const download = String(req.query.download ?? '') === '1';

        const server = await getServerOrThrow(serverId);
        const location = getBackupFileLocation(server);
        const resolved = await resolveServerPath({
            serverId,
            path: joinApiPath(location.basePath, apiPath),
            root: location.root,
        });
        await ensureIsFile(resolved.absPath, resolved.rootDir);

        const filename = getBasenameFromApiPath(resolved.apiPath);
        assertSupportedBackupArchive(server, filename);

        if (download) return res.download(resolved.absPath, filename);

        res.setHeader('Content-Type', guessContentTypeByName(filename));
        return res.sendFile(resolved.absPath, { dotfiles: 'allow' });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:BACKUPS:FILE_READ',
            fallbackMessage: 'Failed to read backup file',
            logContext: { serverId: req.params.id },
        });
    }
});

// PATCH /api/servers/:id/backups/file
router.patch('/file', requireServerPermission(PERMISSIONS.backups.rename), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
        const body = requireBodyObject(req.body);

        const apiPath = typeof body.path === 'string' ? body.path : '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });

        const nextName = normalizeBackupFilename(body.name);
        if (!nextName) return res.status(400).json({ error: 'Invalid backup name' });

        const server = await getServerOrThrow(serverId);
        assertSupportedBackupArchive(server, nextName);

        const location = getBackupFileLocation(server);
        const source = await resolveServerPath({
            serverId,
            path: joinApiPath(location.basePath, apiPath),
            root: location.root,
        });
        await ensureIsFile(source.absPath, source.rootDir);

        const currentName = getBasenameFromApiPath(source.apiPath);
        assertSupportedBackupArchive(server, currentName);

        const targetRelativePath = path.posix.join(path.posix.dirname(apiPath || '/'), nextName);
        const target = await resolveServerPath({
            serverId,
            path: joinApiPath(location.basePath, targetRelativePath),
            root: location.root,
        });

        if (source.absPath === target.absPath) {
            return res.json({ success: true, path: apiPath.startsWith('/') ? apiPath : `/${apiPath}`, name: nextName });
        }

        const existingTarget = await fs.lstat(target.absPath).catch(() => null);
        if (existingTarget) {
            return res.status(409).json({ error: 'A backup with this name already exists' });
        }

        await fs.rename(source.absPath, target.absPath);
        await actionsRepository.create(
            serverId,
            'info',
            `Backup renamed: ${currentName} -> ${nextName}`,
            req.user?.username || ""
        );

        return res.json({
            success: true,
            path: targetRelativePath.startsWith('/') ? targetRelativePath : `/${targetRelativePath}`,
            name: nextName,
        });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:BACKUPS:RENAME',
            fallbackMessage: 'Failed to rename backup',
            logContext: { serverId: req.params.id },
        });
    }
});

// GET /api/servers/:id/backups/settings
router.get('/settings', requireServerPermission(PERMISSIONS.backups.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        res.json(await getBackupSettings(serverId));
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:BACKUPS:SETTINGS_READ',
            fallbackMessage: 'Failed to read backup settings',
            logContext: { serverId: req.params.id },
        });
    }
});

// POST /api/servers/:id/backups/create
router.post(
    '/create',
    requireServerPermission(PERMISSIONS.backups.create),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
            const body = req.body === undefined ? {} : requireBodyObject(req.body);

            const server = await getServerOrThrow(serverId);
            await actionsRepository.create(serverId, 'info', 'Backup requested', req.user?.username || "");

            const result = await createServerBackup(server, {
                includeServerArtifact: optionalBoolean(body.includeServerArtifact, 'includeServerArtifact must be a boolean') ?? false,
            });

            await actionsRepository.create(
                serverId,
                result.ok ? 'success' : 'error',
                result.ok ? 'Backup completed' : `Backup failed (exitCode=${result.exitCode})`,
                req.user?.username || ""
            );

            return res.json(result);
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:BACKUPS:CREATE',
                fallbackMessage: 'Backup failed',
                logContext: { serverId: req.params.id },
            });
        }
    }
);

// POST /api/servers/:id/backups/restore
router.post(
    '/restore',
    requireServerPermission(PERMISSIONS.backups.restore),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
            const body = requireBodyObject(req.body);

            const apiPath = typeof body.path === 'string' ? body.path : '';
            if (!apiPath) return res.status(400).json({ error: 'Missing path' });

            const server = await getServerOrThrow(serverId);
            if (server.provider !== 'ovhcloud') {
                return res.status(501).json({ error: 'Restore is only supported for OVHcloud servers with restore support' });
            }

            const location = getBackupFileLocation(server);
            const resolved = await resolveServerPath({
                serverId,
                path: joinApiPath(location.basePath, apiPath),
                root: location.root,
            });
            await ensureIsFile(resolved.absPath, resolved.rootDir);

            const filename = getBasenameFromApiPath(resolved.apiPath);
            assertSupportedBackupArchive(server, filename);

            await actionsRepository.create(serverId, 'info', `Restore requested: ${filename}`, req.user?.username || "");

            const result = await restoreOvhcloudBackup(server, {
                apiPath,
                resolvedApiPath: resolved.apiPath,
                location,
            });

            await actionsRepository.create(
                serverId,
                result.ok ? 'success' : 'error',
                result.ok ? 'Restore completed' : `Restore failed (exitCode=${result.exitCode})`,
                req.user?.username || ""
            );

            return res.json(result);
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:BACKUPS:RESTORE',
                fallbackMessage: 'Restore failed',
                logContext: { serverId: req.params.id },
            });
        }
    }
);

// PATCH /api/servers/:id/backups/settings
router.patch('/settings', requireServerPermission(PERMISSIONS.backups.settingsWrite), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
        const body = requireBodyObject(req.body);

        const maxBackups = optionalNumber(body.maxBackups, 'maxBackups must be a number');
        const maxBackupDays = optionalNumber(body.maxBackupDays, 'maxBackupDays must be a number');
        const stopOnBackup = optionalBoolean(body.stopOnBackup, 'stopOnBackup must be a boolean');

        await setBackupSettings(serverId, {
            ...(maxBackups !== undefined ? { maxBackups } : {}),
            ...(maxBackupDays !== undefined ? { maxBackupDays } : {}),
            ...(stopOnBackup !== undefined ? { stopOnBackup } : {}),
        });

        const fresh = await getBackupSettings(serverId);
        res.json(fresh);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:BACKUPS:SETTINGS_WRITE',
            fallbackMessage: 'Failed to update backup settings',
            logContext: { serverId: req.params.id },
        });
    }
});

// DELETE /api/servers/:id/backups/file
router.delete('/file', requireServerPermission(PERMISSIONS.backups.delete), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const apiPath = optionalQueryString(req.query.path) ?? '';
        if (!apiPath) return res.status(400).json({ error: 'Missing path' });

        const server = await getServerOrThrow(serverId);
        const location = getBackupFileLocation(server);
        const resolved = await resolveServerPath({
            serverId,
            path: joinApiPath(location.basePath, apiPath),
            root: location.root,
        });
        await ensureIsFile(resolved.absPath, resolved.rootDir);

        const filename = getBasenameFromApiPath(resolved.apiPath);
        assertSupportedBackupArchive(server, filename);

        await fs.unlink(resolved.absPath);

        return res.json({ success: true });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:BACKUPS:DELETE',
            fallbackMessage: 'Failed to delete backup',
            logContext: { serverId: req.params.id },
        });
    }
});

export default router;
