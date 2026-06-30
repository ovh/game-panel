import { Router, type Response } from 'express';
import { actionsRepository, serverRepository } from '../../../../database/index.js';
import { type AuthenticatedRequest, requireServerPermission } from '../../../../middleware/auth.js';
import type { GameServerRow } from '../../../../types/gameServer.js';
import {
    optionalString,
    requireBodyObject,
    requirePositiveInt,
    requireRecord,
} from '../../../../utils/httpValidation.js';
import { sendRouteError } from '../../../../utils/routeErrors.js';
import type { GameConsoleCommandResult } from '../../../../services/gameConsole.js';
import { PERMISSIONS } from '../../../../permissions.js';
import { createScopedFileAreaRouter } from '../../../../routes/scopedFileArea.js';
import { getOvhcloudMinecraftMetadata } from '../../../serverMetadata.js';
import {
    listMinecraftIpBans,
    listMinecraftSettings,
    listMinecraftOperators,
    listMinecraftPlayerBans,
    listMinecraftWhitelist,
    patchMinecraftSettings,
    runMinecraftIpBanCommand,
    runMinecraftIpPardonCommand,
    runMinecraftOperatorCommand,
    runMinecraftPlayerBanCommand,
    runMinecraftPlayerPardonCommand,
    runMinecraftWhitelistEnabledCommand,
    runMinecraftWhitelistPlayerCommand,
} from './javaFeatures.js';

const router = Router({ mergeParams: true });

type GameServerWithContainer = GameServerRow & {
    docker_container_id: string;
};

async function getServerOrThrow(serverId: number): Promise<GameServerWithContainer> {
    const server = await serverRepository.findById(serverId);

    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    if (!server.docker_container_id) {
        throw Object.assign(new Error('Server has no container'), { statusCode: 400 });
    }

    return server as GameServerWithContainer;
}

function getSettingsPatch(body: unknown): Record<string, unknown> {
    return requireRecord(requireBodyObject(body).settings, 'settings must be an object');
}

function routeServerId(req: AuthenticatedRequest): number {
    return requirePositiveInt(req.params.id, 'Invalid server id');
}

async function logCommandResult(params: {
    serverId: number;
    actor: string;
    action: string;
    result: GameConsoleCommandResult;
}): Promise<void> {
    await actionsRepository.create(
        params.serverId,
        params.result.ok ? 'success' : 'error',
        params.result.ok
            ? params.action
            : `${params.action} failed (exitCode=${params.result.exitCode})`,
        params.actor
    );
}

function routeActor(req: AuthenticatedRequest): string {
    return req.user?.username || '';
}

// GET /api/servers/:id/minecraft/settings
router.get('/settings', requireServerPermission(PERMISSIONS.minecraft.settings.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const settings = await listMinecraftSettings(server);
        return res.json({ settings });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:SETTINGS_READ',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to read Minecraft settings',
        });
    }
});

// PATCH /api/servers/:id/minecraft/settings
router.patch('/settings', requireServerPermission(PERMISSIONS.minecraft.settings.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const result = await patchMinecraftSettings(server, getSettingsPatch(req.body));

        await actionsRepository.create(
            serverId,
            'success',
            `Minecraft settings updated: ${result.updated.join(', ')}`,
            routeActor(req)
        );

        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:SETTINGS_WRITE',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to update Minecraft settings',
        });
    }
});

// /api/servers/:id/minecraft/addons
router.use('/addons', createScopedFileAreaRouter({
    permissions: {
        read: PERMISSIONS.minecraft.addons.read,
        write: PERMISSIONS.minecraft.addons.write,
    },
    routeName: 'ROUTE:MINECRAFT:ADDONS',
    resolveArea(server) {
        const metadata = getOvhcloudMinecraftMetadata(server);

        if (metadata.edition !== 'java') {
            throw Object.assign(new Error('Addons are only available for OVHcloud Minecraft Java servers'), { statusCode: 501 });
        }

        if (metadata.serverType === 'paper') {
            return {
                root: 'data',
                basePath: '/plugins',
                kind: 'plugins',
            };
        }

        if (metadata.serverType === 'fabric' || metadata.serverType === 'neoforge') {
            return {
                root: 'data',
                basePath: '/mods',
                kind: 'mods',
            };
        }

        throw Object.assign(new Error('Addons are not supported for this Minecraft image'), { statusCode: 501 });
    },
}));

// GET /api/servers/:id/minecraft/operators
router.get('/operators', requireServerPermission(PERMISSIONS.minecraft.operators.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const operators = await listMinecraftOperators(server);
        return res.json({ operators });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:OPERATORS_READ',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to read Minecraft operators',
        });
    }
});

// POST /api/servers/:id/minecraft/operators
router.post('/operators', requireServerPermission(PERMISSIONS.minecraft.operators.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const body = requireBodyObject(req.body);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftOperatorCommand(server, 'op', body.name);
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft operator added', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:OPERATOR_ADD',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to add Minecraft operator',
        });
    }
});

// DELETE /api/servers/:id/minecraft/operators/:name
router.delete('/operators/:name', requireServerPermission(PERMISSIONS.minecraft.operators.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftOperatorCommand(server, 'deop', req.params.name);
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft operator removed', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:OPERATOR_REMOVE',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to remove Minecraft operator',
        });
    }
});

// GET /api/servers/:id/minecraft/whitelist
router.get('/whitelist', requireServerPermission(PERMISSIONS.minecraft.whitelist.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const whitelist = await listMinecraftWhitelist(server);
        return res.json({ whitelist });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:WHITELIST_READ',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to read Minecraft whitelist',
        });
    }
});

// PATCH /api/servers/:id/minecraft/whitelist
router.patch('/whitelist', requireServerPermission(PERMISSIONS.minecraft.whitelist.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const body = requireBodyObject(req.body);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftWhitelistEnabledCommand(server, body.enabled);
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft whitelist updated', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:WHITELIST_TOGGLE',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to update Minecraft whitelist',
        });
    }
});

// POST /api/servers/:id/minecraft/whitelist/players
router.post('/whitelist/players', requireServerPermission(PERMISSIONS.minecraft.whitelist.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const body = requireBodyObject(req.body);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftWhitelistPlayerCommand(server, 'add', body.name);
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft whitelist player added', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:WHITELIST_PLAYER_ADD',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to add Minecraft whitelist player',
        });
    }
});

// DELETE /api/servers/:id/minecraft/whitelist/players/:name
router.delete('/whitelist/players/:name', requireServerPermission(PERMISSIONS.minecraft.whitelist.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftWhitelistPlayerCommand(server, 'remove', req.params.name);
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft whitelist player removed', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:WHITELIST_PLAYER_REMOVE',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to remove Minecraft whitelist player',
        });
    }
});

// GET /api/servers/:id/minecraft/bans/players
router.get('/bans/players', requireServerPermission(PERMISSIONS.minecraft.bans.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const bans = await listMinecraftPlayerBans(server);
        return res.json({ bans });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:BANS_PLAYERS_READ',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to read Minecraft player bans',
        });
    }
});

// POST /api/servers/:id/minecraft/bans/players
router.post('/bans/players', requireServerPermission(PERMISSIONS.minecraft.bans.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const body = requireBodyObject(req.body);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftPlayerBanCommand(server, body.name, optionalString(body.reason));
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft player banned', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:BANS_PLAYER_ADD',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to ban Minecraft player',
        });
    }
});

// DELETE /api/servers/:id/minecraft/bans/players/:name
router.delete('/bans/players/:name', requireServerPermission(PERMISSIONS.minecraft.bans.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftPlayerPardonCommand(server, req.params.name);
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft player unbanned', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:BANS_PLAYER_REMOVE',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to unban Minecraft player',
        });
    }
});

// GET /api/servers/:id/minecraft/bans/ips
router.get('/bans/ips', requireServerPermission(PERMISSIONS.minecraft.ipBans.read), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const bans = await listMinecraftIpBans(server);
        return res.json({ bans });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:BANS_IPS_READ',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to read Minecraft IP bans',
        });
    }
});

// POST /api/servers/:id/minecraft/bans/ips
router.post('/bans/ips', requireServerPermission(PERMISSIONS.minecraft.ipBans.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const body = requireBodyObject(req.body);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftIpBanCommand(server, body.target, optionalString(body.reason));
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft IP banned', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:BANS_IP_ADD',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to ban Minecraft IP',
        });
    }
});

// DELETE /api/servers/:id/minecraft/bans/ips/:ip
router.delete('/bans/ips/:ip', requireServerPermission(PERMISSIONS.minecraft.ipBans.write), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const result = await runMinecraftIpPardonCommand(server, req.params.ip);
        await logCommandResult({ serverId, actor: routeActor(req), action: 'Minecraft IP unbanned', result });
        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:MINECRAFT:BANS_IP_REMOVE',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to unban Minecraft IP',
        });
    }
});

export default router;
