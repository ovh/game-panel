import { Router, type Response } from 'express';
import {
    type AuthenticatedRequest,
    requireServerPermission,
} from '../../middleware/auth.js';
import { deleteServerBestEffort } from '../../services/servers.js';
import { sendRouteError } from '../../utils/routeErrors.js';
import { PERMISSIONS } from '../../permissions.js';
import { parseServerId } from './shared.js';

export function createServerDeleteRoutes(): Router {
    const router = Router();

    // DELETE /api/servers/:id
    router.delete(
        '/:id',
        requireServerPermission(PERMISSIONS.server.delete),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const serverId = parseServerId(req.params.id);
                if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

                await deleteServerBestEffort(serverId);

                return res.json({ success: true, message: 'Server deleted' });
            } catch (error) {
                return sendRouteError(res, error, {
                    route: 'ROUTE:SERVERS:DELETE',
                    fallbackMessage: 'Failed to delete server',
                    logContext: { serverId: req.params.id },
                });
            }
        }
    );

    return router;
}
