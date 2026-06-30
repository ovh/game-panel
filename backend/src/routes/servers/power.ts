import { Router, type Response } from 'express';
import {
    type AuthenticatedRequest,
    requireServerPermission,
} from '../../middleware/auth.js';
import * as dockerUtils from '../../utils/docker.js';
import {
    actionsRepository,
    serverRepository,
} from '../../database/index.js';
import { assertHostPortsAvailableForServer } from '../../services/hostPortAvailability.js';
import { removeLinuxGsmContainerCronsBestEffort } from '../../services/linuxGsmCrons.js';
import {
    afterOvhcloudServerStopped,
    getServerStopTimeoutSeconds,
    restartOvhcloudServerIfHandled,
    startOvhcloudServerIfHandled,
} from '../../services/ovhcloudLifecycle.js';
import { parseStoredPorts } from '../../providers/runtimeConfig.js';
import {
    beginServerTransition,
    clearServerTransition,
    POWER_TRANSITION_TIMEOUT_MS,
    RESTART_HEALTH_POLL_DELAY_MS,
    reconcileServerStatus,
} from '../../services/serverTransitions.js';
import { logError } from '../../utils/logger.js';
import { sendRouteError } from '../../utils/routeErrors.js';
import { PERMISSIONS } from '../../permissions.js';
import type { GameServerRow } from '../../types/gameServer.js';
import { assertCanPowerServer } from '../../services/serverActionPolicy.js';
import {
    completeDockerPowerTransition,
    parseServerId,
} from './shared.js';

type GameServerWithContainer = GameServerRow & {
    docker_container_id: string;
};

async function getServerForPowerAction(serverId: number): Promise<GameServerWithContainer> {
    const server = await serverRepository.findById(serverId);

    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    assertCanPowerServer(server);

    if (!server.docker_container_id) {
        throw Object.assign(new Error('Server has no container'), { statusCode: 400 });
    }

    return server as GameServerWithContainer;
}

export function createServerPowerRoutes(): Router {
    const router = Router();

    // POST /api/servers/:id/start
    router.post(
        '/:id/start',
        requireServerPermission(PERMISSIONS.server.power),
        async (req: AuthenticatedRequest, res: Response) => {
            let serverId: number | null = null;

            try {
                serverId = parseServerId(req.params.id);
                if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

                const server = await getServerForPowerAction(serverId);
                const currentStatus = await dockerUtils.checkContainerStatus(server.docker_container_id);
                if (currentStatus !== 'running') {
                    await assertHostPortsAvailableForServer({
                        ports: parseStoredPorts(server),
                        excludeServerId: serverId,
                        excludeContainerIds: [server.docker_container_id],
                    });
                }

                await serverRepository.updateDesiredState(serverId, 'running');
                await beginServerTransition(serverId, 'starting', {
                    timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
                    timeoutBehavior: 'reconcile',
                    pollDockerHealth: true,
                });

                if (currentStatus !== 'running') {
                    const handled = await startOvhcloudServerIfHandled(serverId, server);
                    if (!handled) {
                        await dockerUtils.startContainer(server.docker_container_id);
                    }
                }

                const freshServer = await serverRepository.findById(serverId);
                if (freshServer) await removeLinuxGsmContainerCronsBestEffort(freshServer);
                await completeDockerPowerTransition(serverId);

                await actionsRepository.create(
                    serverId,
                    'info',
                    'Server start initiated',
                    req.user?.username || ''
                );

                return res.json({ success: true, message: 'Server start initiated' });
            } catch (error) {
                return sendRouteError(res, error, {
                    route: 'ROUTE:SERVERS:START',
                    fallbackMessage: 'Failed to start server',
                    logContext: { serverId: req.params.id },
                    onServerError: async () => {
                        if (!serverId) return;
                        clearServerTransition(serverId);
                        await reconcileServerStatus(serverId).catch((reconcileError) => {
                            logError('ROUTE:SERVERS:START:RECONCILE', reconcileError, { serverId });
                        });
                    },
                });
            }
        }
    );

    // POST /api/servers/:id/stop
    router.post(
        '/:id/stop',
        requireServerPermission(PERMISSIONS.server.power),
        async (req: AuthenticatedRequest, res: Response) => {
            let serverId: number | null = null;

            try {
                serverId = parseServerId(req.params.id);
                if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

                const server = await getServerForPowerAction(serverId);
                await serverRepository.updateDesiredState(serverId, 'stopped');
                await beginServerTransition(serverId, 'stopping', {
                    timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
                    timeoutBehavior: 'reconcile',
                    pollDockerHealth: false,
                });

                const currentStatus = await dockerUtils.checkContainerStatus(server.docker_container_id);
                if (currentStatus === 'running') {
                    await dockerUtils.stopContainer(
                        server.docker_container_id,
                        getServerStopTimeoutSeconds(server)
                    );
                }
                await afterOvhcloudServerStopped(serverId, server);

                await reconcileServerStatus(serverId);
                await actionsRepository.create(serverId, 'info', 'Server stopped', req.user?.username || '');

                return res.json({ success: true, message: 'Server stopped' });
            } catch (error) {
                return sendRouteError(res, error, {
                    route: 'ROUTE:SERVERS:STOP',
                    fallbackMessage: 'Failed to stop server',
                    logContext: { serverId: req.params.id },
                    onServerError: async () => {
                        if (!serverId) return;
                        clearServerTransition(serverId);
                        await reconcileServerStatus(serverId).catch((reconcileError) => {
                            logError('ROUTE:SERVERS:STOP:RECONCILE', reconcileError, { serverId });
                        });
                    },
                });
            }
        }
    );

    // POST /api/servers/:id/restart
    router.post(
        '/:id/restart',
        requireServerPermission(PERMISSIONS.server.power),
        async (req: AuthenticatedRequest, res: Response) => {
            let serverId: number | null = null;

            try {
                serverId = parseServerId(req.params.id);
                if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

                const server = await getServerForPowerAction(serverId);
                const currentStatus = await dockerUtils.checkContainerStatus(server.docker_container_id);
                if (currentStatus !== 'running') {
                    await assertHostPortsAvailableForServer({
                        ports: parseStoredPorts(server),
                        excludeServerId: serverId,
                        excludeContainerIds: [server.docker_container_id],
                    });
                }

                await serverRepository.updateDesiredState(serverId, 'running');
                await beginServerTransition(serverId, 'restarting', {
                    timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
                    timeoutBehavior: 'reconcile',
                    pollDockerHealth: true,
                    healthPollDelayMs: RESTART_HEALTH_POLL_DELAY_MS,
                });

                const handled = await restartOvhcloudServerIfHandled(serverId, server);
                if (!handled && currentStatus === 'running') {
                    await dockerUtils.restartContainer(
                        server.docker_container_id,
                        getServerStopTimeoutSeconds(server)
                    );
                } else if (!handled) {
                    await dockerUtils.startContainer(server.docker_container_id);
                }

                const freshServer = await serverRepository.findById(serverId);
                if (freshServer) await removeLinuxGsmContainerCronsBestEffort(freshServer);
                await completeDockerPowerTransition(serverId);

                await actionsRepository.create(
                    serverId,
                    'info',
                    'Server restart initiated',
                    req.user?.username || ''
                );

                return res.json({ success: true, message: 'Server restart initiated' });
            } catch (error) {
                return sendRouteError(res, error, {
                    route: 'ROUTE:SERVERS:RESTART',
                    fallbackMessage: 'Failed to restart server',
                    logContext: { serverId: req.params.id },
                    onServerError: async () => {
                        if (!serverId) return;
                        clearServerTransition(serverId);
                        await reconcileServerStatus(serverId).catch((reconcileError) => {
                            logError('ROUTE:SERVERS:RESTART:RECONCILE', reconcileError, { serverId });
                        });
                    },
                });
            }
        }
    );

    return router;
}
