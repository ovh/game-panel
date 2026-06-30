import express, { type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { getServerOrThrow } from '../services/servers.js';
import { createTerminalSession } from '../websocket/terminalManager.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { getRuntimeConfig } from '../providers/serverMetadata.js';
import { PERMISSIONS } from '../permissions.js';
import { checkContainerStatus } from '../utils/docker.js';
import { requirePositiveInt } from '../utils/httpValidation.js';

const router = express.Router({ mergeParams: true });

// POST /api/servers/:id/terminal/container/sessions
router.post('/container/sessions', requireServerPermission(PERMISSIONS.container.terminal), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

        const server = await getServerOrThrow(serverId);
        const containerStatus = await checkContainerStatus(server.docker_container_id).catch(() => 'missing');
        if (containerStatus !== 'running') {
            return res.status(409).json({
                error: `Terminal requires a running container; current status is ${containerStatus}`,
            });
        }

        const runtimeConfig = getRuntimeConfig(server);
        const terminalUser = typeof runtimeConfig.terminalUser === 'string' ? runtimeConfig.terminalUser : undefined;
        const terminalWorkdir = typeof runtimeConfig.terminalWorkdir === 'string' ? runtimeConfig.terminalWorkdir : undefined;

        const { sessionId } = await createTerminalSession({
            serverId,
            containerId: server.docker_container_id,
            ownerUserId: req.user!.userId,
            user: terminalUser,
            workdir: terminalWorkdir,
        });

        return res.json({ sessionId });
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:TERMINAL:SESSION',
            fallbackMessage: 'Terminal session error',
            logContext: { serverId: req.params.id },
        });
    }
});

export default router;
