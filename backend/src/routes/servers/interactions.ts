import { Router, type Response } from 'express';
import {
    type AuthenticatedRequest,
    requireServerPermission,
} from '../../middleware/auth.js';
import { installInteractionRepository } from '../../database/index.js';
import { serializeInstallationInteraction } from '../../utils/apiSerialization.js';
import { requireBodyObject, requirePositiveInt } from '../../utils/httpValidation.js';
import { sendRouteError } from '../../utils/routeErrors.js';
import { PERMISSIONS } from '../../permissions.js';

export function createServerInteractionRoutes(): Router {
    const router = Router();

    // POST /api/servers/:id/install/interactions/:interactionId/respond
    router.post(
        '/:id/install/interactions/:interactionId/respond',
        requireServerPermission(PERMISSIONS.server.edit),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
                const interactionId = requirePositiveInt(req.params.interactionId, 'Invalid interaction id');
                const response = requireBodyObject(req.body);

                const interaction = await installInteractionRepository.findById(interactionId);
                if (!interaction || interaction.server_id !== serverId) {
                    return res.status(404).json({ error: 'Installation interaction not found' });
                }

                if (interaction.status !== 'pending') {
                    return res.status(409).json({ error: `Installation interaction is ${interaction.status}` });
                }

                const updated = await installInteractionRepository.respond(interactionId, serverId, response);
                return res.json({
                    success: true,
                    interaction: updated ? serializeInstallationInteraction(updated) : updated,
                });
            } catch (error) {
                return sendRouteError(res, error, {
                    route: 'ROUTE:SERVERS:INSTALL_INTERACTION_RESPOND',
                    fallbackMessage: 'Failed to respond to installation interaction',
                    logContext: {
                        serverId: req.params.id,
                        interactionId: req.params.interactionId,
                    },
                });
            }
        }
    );

    return router;
}
