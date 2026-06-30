import { Router, type Response } from 'express';
import { actionsRepository, serverRepository } from '../../../../database/index.js';
import { type AuthenticatedRequest, requireServerPermission } from '../../../../middleware/auth.js';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { requireBodyObject, requirePositiveInt, requireRecord } from '../../../../utils/httpValidation.js';
import { sendRouteError } from '../../../../utils/routeErrors.js';
import { PERMISSIONS } from '../../../../permissions.js';
import { createScopedFileAreaRouter } from '../../../../routes/scopedFileArea.js';
import { assertOvhcloudHytaleServer } from '../hytale.js';
import {
    listHytaleSettings,
    patchHytaleSettings,
} from './settings.js';

const router = Router({ mergeParams: true });

async function getServerOrThrow(serverId: number): Promise<GameServerRow> {
    const server = await serverRepository.findById(serverId);

    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    assertOvhcloudHytaleServer(server);
    return server;
}

function getSettingsPatch(body: unknown): Record<string, unknown> {
    return requireRecord(requireBodyObject(body).settings, 'settings must be an object');
}

function routeServerId(req: AuthenticatedRequest): number {
    return requirePositiveInt(req.params.id, 'Invalid server id');
}

function routeActor(req: AuthenticatedRequest): string {
    return req.user?.username || '';
}

// GET /api/servers/:id/hytale/settings
router.get('/settings', requireServerPermission(PERMISSIONS.hytale.settings.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const settings = await listHytaleSettings(server);
        return res.json({ settings });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:HYTALE:SETTINGS_READ',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to read Hytale settings',
        });
    }
});

// PATCH /api/servers/:id/hytale/settings
router.patch('/settings', requireServerPermission(PERMISSIONS.hytale.settings.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const result = await patchHytaleSettings(server, getSettingsPatch(req.body));

        await actionsRepository.create(
            serverId,
            'success',
            `Hytale settings updated: ${result.updated.join(', ')}`,
            routeActor(req)
        );

        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:HYTALE:SETTINGS_WRITE',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to update Hytale settings',
        });
    }
});

// /api/servers/:id/hytale/mods
router.use('/mods', createScopedFileAreaRouter({
    permissions: {
        read: PERMISSIONS.hytale.mods.read,
        write: PERMISSIONS.hytale.mods.write,
    },
    routeName: 'ROUTE:HYTALE:MODS',
    resolveArea(server) {
        assertOvhcloudHytaleServer(server);
        return {
            root: 'data',
            basePath: '/game/Server/mods',
            kind: 'mods',
        };
    },
}));

export default router;
