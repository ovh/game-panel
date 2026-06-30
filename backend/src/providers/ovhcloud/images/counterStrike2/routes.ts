import { Router, type Response } from 'express';
import { actionsRepository, serverRepository } from '../../../../database/index.js';
import { type AuthenticatedRequest, requireServerPermission } from '../../../../middleware/auth.js';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { requireBodyObject, requirePositiveInt } from '../../../../utils/httpValidation.js';
import { sendRouteError } from '../../../../utils/routeErrors.js';
import { PERMISSIONS } from '../../../../permissions.js';
import {
    inspectCounterStrike2Frameworks,
    runCounterStrike2FrameworkScript,
} from './service.js';

const router = Router({ mergeParams: true });

type GameServerWithContainer = GameServerRow & {
    docker_container_id: string;
};

type FrameworkBody = {
    version?: unknown;
    releaseFlavor?: unknown;
    gameinfoMode?: unknown;
};

function getOptionalString(body: FrameworkBody, key: keyof FrameworkBody): string | null {
    const value = body[key];
    return typeof value === 'string' ? value : null;
}

function routeServerId(req: AuthenticatedRequest): number {
    return requirePositiveInt(req.params.id, 'Invalid server id');
}

function optionalBodyObject(body: unknown): Record<string, unknown> {
    return body === undefined ? {} : requireBodyObject(body);
}

function normalizeReleaseFlavor(value: unknown): 'with-runtime' | 'normal' | 'auto' | null {
    if (value === undefined || value === null || value === '') return null;
    if (value === 'with-runtime' || value === 'normal' || value === 'auto') return value;
    throw Object.assign(new Error('releaseFlavor must be one of: with-runtime, normal, auto'), { statusCode: 400 });
}

function normalizeGameinfoMode(value: unknown): 'ensure' | 'check' | 'skip' | null {
    if (value === undefined || value === null || value === '') return null;
    if (value === 'ensure' || value === 'check' || value === 'skip') return value;
    throw Object.assign(new Error('gameinfoMode must be one of: ensure, check, skip'), { statusCode: 400 });
}

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

// GET /api/servers/:id/counter-strike-2/frameworks
router.get('/frameworks', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const server = await getServerOrThrow(serverId);
        const frameworks = await inspectCounterStrike2Frameworks(server);
        return res.json({ frameworks });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:CS2:FRAMEWORKS_READ',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to inspect Counter-Strike 2 frameworks',
        });
    }
});

// POST /api/servers/:id/counter-strike-2/metamod/install
router.post('/metamod/install', requireServerPermission(PERMISSIONS.counterStrike2.frameworksWrite), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const body = optionalBodyObject(req.body);

        const server = await getServerOrThrow(serverId);
        await actionsRepository.create(serverId, 'info', 'Counter-Strike 2 MetaMod install requested', req.user?.username || "");

        const result = await runCounterStrike2FrameworkScript(server, 'install-metamod', {
            version: getOptionalString(body, 'version'),
            gameinfoMode: normalizeGameinfoMode(body.gameinfoMode),
        });

        await actionsRepository.create(
            serverId,
            result.ok ? 'success' : 'error',
            result.ok ? 'Counter-Strike 2 MetaMod installed' : `Counter-Strike 2 MetaMod install failed (exitCode=${result.exitCode})`,
            req.user?.username || ""
        );

        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:CS2:METAMOD_INSTALL',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to install Counter-Strike 2 MetaMod',
        });
    }
});

// POST /api/servers/:id/counter-strike-2/counterstrikesharp/install
router.post('/counterstrikesharp/install', requireServerPermission(PERMISSIONS.counterStrike2.frameworksWrite), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const body = optionalBodyObject(req.body);

        const server = await getServerOrThrow(serverId);
        await actionsRepository.create(serverId, 'info', 'Counter-Strike 2 CounterStrikeSharp install requested', req.user?.username || "");

        const result = await runCounterStrike2FrameworkScript(server, 'install-counterstrikesharp', {
            version: getOptionalString(body, 'version'),
            releaseFlavor: normalizeReleaseFlavor(body.releaseFlavor),
            gameinfoMode: normalizeGameinfoMode(body.gameinfoMode),
        });

        await actionsRepository.create(
            serverId,
            result.ok ? 'success' : 'error',
            result.ok
                ? 'Counter-Strike 2 CounterStrikeSharp installed'
                : `Counter-Strike 2 CounterStrikeSharp install failed (exitCode=${result.exitCode})`,
            req.user?.username || ""
        );

        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:CS2:CSS_INSTALL',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to install Counter-Strike 2 CounterStrikeSharp',
        });
    }
});

// POST /api/servers/:id/counter-strike-2/frameworks/repair
router.post('/frameworks/repair', requireServerPermission(PERMISSIONS.counterStrike2.frameworksWrite), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = routeServerId(req);
        const body = optionalBodyObject(req.body);

        const server = await getServerOrThrow(serverId);
        await actionsRepository.create(serverId, 'info', 'Counter-Strike 2 framework repair requested', req.user?.username || "");

        const result = await runCounterStrike2FrameworkScript(server, 'repair-frameworks', {
            gameinfoMode: normalizeGameinfoMode(body.gameinfoMode),
        });

        await actionsRepository.create(
            serverId,
            result.ok ? 'success' : 'error',
            result.ok ? 'Counter-Strike 2 frameworks repaired' : `Counter-Strike 2 framework repair failed (exitCode=${result.exitCode})`,
            req.user?.username || ""
        );

        return res.json(result);
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:CS2:FRAMEWORKS_REPAIR',
            logContext: { serverId: req.params.id },
            fallbackMessage: 'Failed to repair Counter-Strike 2 frameworks',
        });
    }
});

export default router;
