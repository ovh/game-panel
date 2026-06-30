import type { WebSocketServer } from 'ws';
import { bus } from '../realtime/bus.js';
import type { AuthenticatedWebSocket } from './types.js';
import { sendSafe } from './auth.js';
import { serverRepository, installProgressRepository, serverMemberRepository } from '../database/index.js';
import { logError } from '../utils/logger.js';
import { PERMISSIONS } from '../permissions.js';
import { nowIso, toIsoTimestamp } from '../utils/time.js';
import type {
    ServerActionEvent,
    ServerCreatedEvent,
    ServerDeletedEvent,
    ServerInstallInteractionEvent,
    ServerInstallProgressEvent,
    ServerFileTransferEvent,
    ServerStatusEvent,
    ServerUpdatedEvent,
    SystemRebootingEvent,
} from '../types/events.js';
import { redactServerEnv, serializeGameServerWithInstallProgress } from '../utils/apiSerialization.js';

interface BroadcasterCleanup {
    shutdown(): void;
}

// Bridges internal realtime bus -> WebSocket broadcasts
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

        const installProgress = await installProgressRepository.getByServerId(serverId);

        const fullServer = serializeGameServerWithInstallProgress(server, installProgress);
        const redactedServer = redactServerEnv(fullServer);
        const envVisibilityByUser = new Map<number, boolean>();

        for (const client of wss.clients) {
            const ws = client as AuthenticatedWebSocket;
            if (!ws.userId || !ws.subs) continue;
            if (!ws.subs.servers) continue;

            let canSeeEnv = ws.isRoot === true;
            if (!canSeeEnv) {
                const cached = envVisibilityByUser.get(ws.userId);
                if (cached !== undefined) {
                    canSeeEnv = cached;
                } else {
                    const perms = await serverMemberRepository.getUserServerPermissions(serverId, ws.userId);
                    canSeeEnv = perms.includes('*') || perms.includes(PERMISSIONS.server.env);
                    envVisibilityByUser.set(ws.userId, canSeeEnv);
                }
            }

            sendSafe(ws, { type, server: canSeeEnv ? fullServer : redactedServer, timestamp: nowIso() });
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
        const timestamp = toIsoTimestamp(e.timestamp);

        for (const client of wss.clients) {
            const ws = client as AuthenticatedWebSocket;
            if (!ws.userId || !ws.subs) continue;

            if (!ws.subs.actions?.has(e.serverId)) continue;

            sendSafe(ws, {
                type: 'actions:new',
                serverId: e.serverId,
                action: {
                    id: e.actionId ?? null,
                    serverId: e.serverId,
                    level: e.level ?? 'info',
                    message: e.message ?? '',
                    actorUsername: e.actorUsername ?? null,
                    timestamp,
                },
                timestamp,
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

    const onInstallInteraction = (evt: unknown) => {
        const e = evt as ServerInstallInteractionEvent;
        if (!e.serverId) return;

        for (const client of wss.clients) {
            const ws = client as AuthenticatedWebSocket;
            if (!ws.userId || !ws.subs) continue;

            if (!ws.subs.install?.has(e.serverId)) continue;

            sendSafe(ws, {
                type: 'install:interaction',
                id: e.id,
                serverId: e.serverId,
                kind: e.kind,
                status: e.status,
                payload: e.payload ?? {},
                response: e.response ?? null,
                expiresAt: e.expiresAt ?? null,
                timestamp: toIsoTimestamp(e.timestamp),
            });
        }
    };

    const onFileTransfer = (evt: unknown) => {
        const e = evt as ServerFileTransferEvent;
        if (!e.serverId || !e.job) return;

        for (const client of wss.clients) {
            const ws = client as AuthenticatedWebSocket;
            if (!ws.userId || !ws.subs) continue;

            if (!ws.subs.fileTransfers?.has(e.serverId)) continue;

            sendSafe(ws, {
                type: 'file-transfer:progress',
                serverId: e.serverId,
                job: e.job,
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
    bus.on('server.install.interaction', onInstallInteraction);
    bus.on('server.file.transfer', onFileTransfer);
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
                bus.off('server.install.interaction', onInstallInteraction);
                bus.off('server.file.transfer', onFileTransfer);
                bus.off('system.rebooting', onSystemRebooting);
            } catch {
                // Ignore listener cleanup errors during shutdown.
            }
        },
    };
}
