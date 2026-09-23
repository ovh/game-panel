import { Router, type Response } from 'express';
import {
    type AuthenticatedRequest,
    buildServerPermissionVisibility,
} from '../../middleware/auth.js';
import { PERMISSIONS } from '../../permissions.js';
import { refreshPlayersCache } from '../../services/players/fleet.js';
import { getPlayersSamples } from '../../utils/playersCache.js';
import { sendRouteError } from '../../utils/routeErrors.js';

export function createServerPlayersRoutes(): Router {
    const router = Router();

    // GET /api/servers/players
    router.get('/players', async (req: AuthenticatedRequest, res: Response) => {
        try {
            const canSeePlayers = await buildServerPermissionVisibility(
                req.user,
                PERMISSIONS.server.playersRead
            );

            await refreshPlayersCache();

            const players = getPlayersSamples().filter((sample) =>
                canSeePlayers(sample.serverId)
            );

            return res.json({ players });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SERVERS:PLAYERS',
                fallbackMessage: 'Failed to fetch server players',
            });
        }
    });

    return router;
}
