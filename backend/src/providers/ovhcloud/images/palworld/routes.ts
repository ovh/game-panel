import { Router, type Response } from 'express';
import { actionsRepository, serverRepository } from '../../../../database/index.js';
import { type AuthenticatedRequest, requireServerPermission } from '../../../../middleware/auth.js';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { requireBodyObject, requirePositiveInt, requireRecord } from '../../../../utils/httpValidation.js';
import { sendRouteError } from '../../../../utils/routeErrors.js';
import { PERMISSIONS } from '../../../../permissions.js';
import { assertOvhcloudPalworldServer } from '../palworld.js';
import {
    listPalworldSettings,
    patchPalworldSettings,
} from './settings.js';

const router = Router({ mergeParams: true });

async function getServerOrThrow(serverId: number): Promise<GameServerRow> {
    const server = await serverRepository.findById(serverId);

    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    assertOvhcloudPalworldServer(server);
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

// GET /api/servers/:id/palworld/settings
router.get('/settings', requireServerPermission(PERMISSIONS.palworld.settings.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const settings = await listPalworldSettings(server);
        return res.json({ settings });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:PALWORLD:SETTINGS_READ',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to read Palworld settings',
        });
    }
});

// PATCH /api/servers/:id/palworld/settings
router.patch('/settings', requireServerPermission(PERMISSIONS.palworld.settings.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const result = await patchPalworldSettings(server, getSettingsPatch(req.body));

        await actionsRepository.create(
            serverId,
            'success',
            `Palworld settings updated: ${result.updated.join(', ')}`,
            routeActor(req)
        );

        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:PALWORLD:SETTINGS_WRITE',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to update Palworld settings',
        });
    }
});

export default router;
