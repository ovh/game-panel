import type { WebSocketServer } from 'ws';
import { bus } from '../realtime/bus.js';
import type { AuthenticatedWebSocket } from './types.js';
import { sendSafe } from './auth.js';
import { serverRepository, installProgressRepository } from '../database/index.js';
import * as dockerUtils from '../utils/docker.js';
import { logError } from '../utils/logger.js';
import { nowIso, toIsoTimestamp } from '../utils/time.js';
import type {
    ServerActionEvent,
    ServerCreatedEvent,
    ServerDeletedEvent,
    ServerInstallProgressEvent,
    ServerSftpEvent,
    ServerStatusEvent,
    ServerUpdatedEvent,
    SystemRebootingEvent,
} from '../types/events.js';
import type { GameServerRow } from '../types/gameServer.js';

interface BroadcasterCleanup {
    shutdown(): void;
}

/**
 * Bridges internal realtime bus -> WebSocket broadcasts
 */
export function attachBroadcaster(wss: WebSocketServer): BroadcasterCleanup {
    const broadcastToServersSubscribers = async (
        serverId: number,
        type: 'servers:created' | 'servers:updated' | 'servers:deleted'
    ) => {
        if (type === 'servers:deleted') {
            for (const client of wss.clients) {
                const ws = client as AuthenticatedWebSocket;
                if (!ws.userId || !ws.subs) continue;
                if (!ws.subs.servers) continue;

                sendSafe(ws, { type: 'servers:deleted', serverId, timestamp: nowIso() });
            }
            return;
        }

        const server = await serverRepository.findById(serverId);
        if (!server) return;

        let actualStatus = server.status;
        if (server.docker_container_id) {
            const containerStatus = await dockerUtils.checkContainerStatus(
                server.docker_container_id
            );
            if (containerStatus !== 'running') actualStatus = 'stopped';
        }

        const installProgress = await installProgressRepository.getByServerId(serverId);

        const payloadServer = {
            ...(server as GameServerRow),
            status: actualStatus,
            install_progress: installProgress,
        };

        for (const client of wss.clients) {
            const ws = client as AuthenticatedWebSocket;
            if (!ws.userId || !ws.subs) continue;
            if (!ws.subs.servers) continue;

            sendSafe(ws, { type, server: payloadServer, timestamp: nowIso() });
        }
    };

    const onServerUpdated = async (evt: unknown) => {
        const e = evt as ServerUpdatedEvent;
        if (!e.serverId) return;

        try {
            await broadcastToServersSubscribers(e.serverId, 'servers:updated');
        } catch (err) {
            logError('WS:BROADCAST:SERVERS_UPDATED', err, { serverId: e.serverId });
        }
    };

    const onServerStatus = async (evt: unknown) => {
        const e = evt as ServerStatusEvent;
        if (!e.serverId) return;

        try {
            await broadcastToServersSubscribers(e.serverId, 'servers:updated');
        } catch (err) {
            logError('WS:BROADCAST:SERVERS_STATUS', err, { serverId: e.serverId });
        }
    };

    const onServerSftp = async (evt: unknown) => {
        const e = evt as ServerSftpEvent;
        if (!e.serverId) return;

        try {
            await broadcastToServersSubscribers(e.serverId, 'servers:updated');
        } catch (err) {
            logError('WS:BROADCAST:SERVERS_SFTP', err, { serverId: e.serverId });
        }
    };

    const onServerCreated = async (evt: unknown) => {
        const e = evt as ServerCreatedEvent;
        if (!e.serverId) return;

        try {
            await broadcastToServersSubscribers(e.serverId, 'servers:created');
        } catch (err) {
            logError('WS:BROADCAST:SERVERS_CREATED', err, { serverId: e.serverId });
        }
    };

    const onServerDeleted = async (evt: unknown) => {
        const e = evt as ServerDeletedEvent;
        if (!e.serverId) return;

        try {
            await broadcastToServersSubscribers(e.serverId, 'servers:deleted');
        } catch (err) {
            logError('WS:BROADCAST:SERVERS_DELETED', err, { serverId: e.serverId });
        }
    };

    const onServerAction = (evt: unknown) => {
        const e = evt as ServerActionEvent;

        if (!e.serverId) return;

        for (const client of wss.clients) {
            const ws = client as AuthenticatedWebSocket;
            if (!ws.userId || !ws.subs) continue;

            if (!ws.subs.actions?.has(e.serverId)) continue;

            sendSafe(ws, {
                type: 'actions:new',
                serverId: e.serverId,
                action: {
                    id: e.actionId ?? null,
                    level: e.level ?? 'info',
                    message: e.message ?? '',
                    actor_username: e.actorUsername ?? null,
                },
                timestamp: toIsoTimestamp(e.timestamp),
            });
        }
    };

    const onInstallProgress = (evt: unknown) => {
        const e = evt as ServerInstallProgressEvent;
        if (!e.serverId) return;

        for (const client of wss.clients) {
            const ws = client as AuthenticatedWebSocket;
            if (!ws.userId || !ws.subs) continue;

            // must be subscribed to this server install channel
            if (!ws.subs.install?.has(e.serverId)) continue;

            sendSafe(ws, {
                type: 'install:progress',
                serverId: e.serverId,
                progress: e.progress ?? 0,
                status: e.status ?? 'pending',
                errorMessage: e.errorMessage ?? null,
                timestamp: toIsoTimestamp(e.timestamp),
            });
        }
    };

    const onSystemRebooting = (evt: unknown) => {
        const e = evt as SystemRebootingEvent;

        for (const client of wss.clients) {
            const ws = client as AuthenticatedWebSocket;
            if (!ws.userId || !ws.subs) continue;

            sendSafe(ws, {
                type: 'system:rebooting',
                byUserId: e.byUserId ?? null,
                timestamp: toIsoTimestamp(e.timestamp),
            });
        }
    };

    bus.on('server.updated', onServerUpdated);
    bus.on('server.status', onServerStatus);
    bus.on('server.action', onServerAction);
    bus.on('server.created', onServerCreated);
    bus.on('server.deleted', onServerDeleted);
    bus.on('server.install.progress', onInstallProgress);
    bus.on('server.sftp', onServerSftp);
    bus.on('system.rebooting', onSystemRebooting);

    return {
        shutdown() {
            try {
                bus.off('server.updated', onServerUpdated);
                bus.off('server.status', onServerStatus);
                bus.off('server.action', onServerAction);
                bus.off('server.created', onServerCreated);
                bus.off('server.deleted', onServerDeleted);
                bus.off('server.install.progress', onInstallProgress);
                bus.off('server.sftp', onServerSftp);
                bus.off('system.rebooting', onSystemRebooting);
            } catch {
                // Ignore listener cleanup errors during shutdown.
            }
        },
    };
}
