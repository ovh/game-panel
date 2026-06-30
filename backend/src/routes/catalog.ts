import { Router, type Response } from 'express';
import { type AuthenticatedRequest } from '../middleware/auth.js';
import { listLinuxGsmCatalog } from '../services/linuxGsmManifest.js';
import { sendRouteError } from '../utils/routeErrors.js';

const router = Router();

// GET /api/catalog/linuxgsm/games
router.get('/linuxgsm/games', async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const catalog = await listLinuxGsmCatalog();

        return res.json({
            games: catalog.games.map((game) => ({
                shortname: game.shortname,
                gameservername: game.gameservername,
                gamename: game.gamename,
                os: game.os,
                dockerImage: game.docker_image,
            })),
            meta: catalog.meta,
        });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:CATALOG:LINUXGSM_GAMES',
            fallbackMessage: 'Failed to read LinuxGSM catalog',
        });
    }
});

export default router;
