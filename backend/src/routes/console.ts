import { Router, type Response } from 'express';
import { actionsRepository, serverRepository } from '../database/index.js';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import type { GameServerRow } from '../types/gameServer.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { sendGameConsoleCommand } from '../services/gameConsole.js';
import { PERMISSIONS } from '../permissions.js';
import { requireBodyObject, requirePositiveInt } from '../utils/httpValidation.js';

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

// POST /api/servers/:id/console/commands
router.post(
    '/commands',
    requireServerPermission(PERMISSIONS.server.commandSend),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
            const body = requireBodyObject(req.body);

            const server = await getServerOrThrow(serverId);
            const result = await sendGameConsoleCommand(server, body.command);

            await actionsRepository.create(
                serverId,
                result.ok ? 'info' : 'error',
                result.ok ? 'Console command sent' : `Console command failed (exitCode=${result.exitCode})`,
                req.user?.username || ''
            );

            return res.json(result);
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:CONSOLE_COMMAND',
                fallbackMessage: 'Failed to send console command',
                logContext: { serverId: req.params.id },
            });
        }
    }
);

export default router;
