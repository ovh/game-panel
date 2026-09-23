import WebSocket, { type WebSocketServer } from 'ws';
import type {
    AuthenticatedWebSocket,
    SubscriptionsState,
    SubscriptionChannel,
    WsSubscribeActionsMessage,
    WsSubscribeFileTransfersMessage,
    WsSubscribeLogsMessage,
    WsSubscribeServersMessage,
    WsSubscribeSystemMetricsMessage,
} from './types.js';
import { sendSafe } from './auth.js';
import {
    serverRepository,
    actionsRepository,
    installProgressRepository,
    installInteractionRepository,
    fileTransferJobRepository,
    systemMetricsRepository,
} from '../database/index.js';
import { serializeFileTransferJob } from '../database/repositories/fileTransferJobRepository.js';
import * as dockerUtils from '../utils/docker.js';
import { logError } from '../utils/logger.js';
import { buildServerEnvVisibility, buildServerPermissionVisibility } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';
import { nowIso } from '../utils/time.js';
import type { InstallationProgressRow, ServerActionRow } from '../types/database.js';
import type { GameServerRow } from '../types/gameServer.js';
import { getInstallStepsForServer } from '../services/installPlan.js';
import {
    redactServerEnv,
    serializeGameServerWithInstallProgress,
    serializeInstallationInteraction,
    serializeInstallationProgress,
    serializeServerAction,
} from '../utils/apiSerialization.js';
import { buildMetricsHistory, METRICS_HISTORY_RAW_LIMIT } from '../utils/metrics.js';
import { parseLimit } from '../utils/number.js';
import { getPlayersSamples, hasPlayersSamples } from '../utils/playersCache.js';
import { refreshPlayersCache } from '../services/players/fleet.js';
import { getServerMetricsSamples } from '../utils/serverMetricsCache.js';

export function ensureSubs(ws: AuthenticatedWebSocket): SubscriptionsState {
    ws.subs ??= {
        logs: new Set<number>(),
        actions: new Set<number>(),
        install: new Set<number>(),
        status: new Set<number>(),
        fileTransfers: new Set<number>(),
        servers: false,
        serversMetrics: false,
        serversPlayers: false,
        systemMetrics: false,
    };

    return ws.subs;
}

export function cleanupClient(ws: AuthenticatedWebSocket): void {
    // Stop active log streams.
    if (ws.logStreams) {
        Object.values(ws.logStreams).forEach((s) => {
            try {
                s.stop();
            } catch {
                // Ignore stream shutdown errors.
            }
        });
        ws.logStreams = {};
    }

    // Clear remaining subscription state.
    ws.subs?.logs.clear();
    ws.subs?.actions.clear();
    ws.subs?.install.clear();
    ws.subs?.status.clear();
    ws.subs?.fileTransfers.clear();

    if (ws.subs) {
        ws.subs.servers = false;
        ws.subs.serversMetrics = false;
        ws.subs.serversPlayers = false;
        ws.subs.systemMetrics = false;
    }
}

async function assertServerAccess(_ws: AuthenticatedWebSocket, serverId: number) {
    const server = await serverRepository.findById(serverId);
    if (!server) return null;
    return server;
}

export function startServerLogStream(
    ws: AuthenticatedWebSocket,
    serverId: number,
    containerId: string
): void {
    ws.logStreams = ws.logStreams ?? {};

    if (ws.logStreams[serverId]) {
        try {
            ws.logStreams[serverId].stop();
        } catch {
            // Ignore teardown errors.
        }
        delete ws.logStreams[serverId];
    }

    ws.logStreams[serverId] = dockerUtils.streamContainerLogs(
        containerId,
        (line) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            if (!ws.subs?.logs.has(serverId)) return;

            sendSafe(ws, {
                type: 'logs:new',
                serverId,
                lines: [line],
                timestamp: nowIso(),
            });
        },
        {
            onEnd: () => {
                if (ws.logStreams?.[serverId]) delete ws.logStreams[serverId];
            },
        }
    );
}

const REATTACH_LOG_HISTORY_LIMIT = 200;

export async function reattachLogStreamsForServer(wss: WebSocketServer, serverId: number): Promise<void> {
    const targets: AuthenticatedWebSocket[] = [];
    for (const client of wss.clients) {
        const ws = client as AuthenticatedWebSocket;
        if (ws.readyState !== WebSocket.OPEN) continue;
        if (!ws.userId || !ws.subs?.logs.has(serverId)) continue;
        if (ws.logStreams?.[serverId]) continue; // already streaming live — nothing to recover

        targets.push(ws);
    }

    if (targets.length === 0) return;

    const server = await serverRepository.findById(serverId);
    const containerId = server?.docker_container_id ?? null;

    if (!containerId || server?.container_status !== 'running') return;

    const containerLogs = await dockerUtils
        .getContainerLogs(containerId, REATTACH_LOG_HISTORY_LIMIT)
        .catch(() => [] as string[]);

    for (const ws of targets) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        if (!ws.subs?.logs.has(serverId)) continue;
        if (ws.logStreams?.[serverId]) continue;

        sendSafe(ws, {
            type: 'logs:history',
            serverId,
            logs: containerLogs,
            limit: REATTACH_LOG_HISTORY_LIMIT,
            timestamp: nowIso(),
        });
        startServerLogStream(ws, serverId, containerId);
    }
}

export async function handleSubscribeServers(
    ws: AuthenticatedWebSocket,
    _message?: WsSubscribeServersMessage
): Promise<void> {
    const subs = ensureSubs(ws);
    subs.servers = true;

    sendSafe(ws, { type: 'servers:subscribed', timestamp: nowIso() });

    try {
        const servers = await serverRepository.listAll();
        const canSeeEnv = await buildServerEnvVisibility(ws);

        const serversWithInstall = await Promise.all(
            servers.map(async (server: GameServerRow) => {
                const installProgress = await installProgressRepository.getByServerId(server.id);

                const serialized = serializeGameServerWithInstallProgress(
                    server,
                    installProgress as InstallationProgressRow | undefined
                );

                return canSeeEnv(server.id) ? serialized : redactServerEnv(serialized);
            })
        );

        sendSafe(ws, { type: 'servers:snapshot', servers: serversWithInstall, timestamp: nowIso() });
    } catch (error) {
        logError('WS:SUB:SERVERS', error);
        sendSafe(ws, { type: 'servers:snapshot', servers: [], timestamp: nowIso() });
    }
}

export async function handleSubscribeLogs(
    ws: AuthenticatedWebSocket,
    serverId: number,
    message?: WsSubscribeLogsMessage
): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) {
        sendSafe(ws, { type: 'error', error: 'Access denied' });
        return;
    }

    const subs = ensureSubs(ws);
    subs.logs.add(serverId);

    const limit = parseLimit(message?.data?.limit, 200, 1000);

    if (server.docker_container_id) {
        const containerLogs = await dockerUtils.getContainerLogs(server.docker_container_id, limit);
        sendSafe(ws, { type: 'logs:history', serverId, logs: containerLogs, limit, timestamp: nowIso() });
    } else {
        sendSafe(ws, { type: 'logs:history', serverId, logs: [], limit, timestamp: nowIso() });
    }

    sendSafe(ws, { type: 'logs:subscribed', serverId, timestamp: nowIso() });

    if (server.docker_container_id) {
        startServerLogStream(ws, serverId, server.docker_container_id);
    }
}

export async function handleSubscribeActions(
    ws: AuthenticatedWebSocket,
    serverId: number,
    message?: WsSubscribeActionsMessage
): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) {
        sendSafe(ws, { type: 'error', error: 'Access denied' });
        return;
    }

    const subs = ensureSubs(ws);
    subs.actions.add(serverId);

    const limit = parseLimit(message?.data?.limit, 200, 2000);

    try {
        const rows = await actionsRepository.getRecent(serverId, limit);

        const actions = rows.reverse().map((row: ServerActionRow) => serializeServerAction(row));

        sendSafe(ws, {
            type: 'actions:history',
            serverId,
            actions,
            limit,
            timestamp: nowIso(),
        });
    } catch (error) {
        logError('WS:SUB:ACTIONS', error);
        sendSafe(ws, { type: 'actions:history', serverId, actions: [], limit, timestamp: nowIso() });
    }

    sendSafe(ws, { type: 'actions:subscribed', serverId, timestamp: nowIso() });
}

export async function handleSubscribeInstall(ws: AuthenticatedWebSocket, serverId: number): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) {
        sendSafe(ws, { type: 'error', error: 'Access denied' });
        return;
    }

    const subs = ensureSubs(ws);
    subs.install.add(serverId);

    const progress = await installProgressRepository.getByServerId(serverId);
    const interaction = await installInteractionRepository.getActiveByServerId(serverId);

    sendSafe(ws, {
        type: 'install:plan',
        serverId,
        steps: getInstallStepsForServer(server),
        timestamp: nowIso(),
    });

    const serializedProgress = serializeInstallationProgress(progress);

    sendSafe(ws, {
        type: 'install:progress',
        serverId,
        progress: serializedProgress?.progress ?? 0,
        status: serializedProgress?.status ?? 'pending',
        errorMessage: serializedProgress?.errorMessage ?? null,
        timestamp: nowIso(),
    });

    if (interaction) {
        const serializedInteraction = serializeInstallationInteraction(interaction);

        sendSafe(ws, {
            type: 'install:interaction',
            ...serializedInteraction,
            timestamp: nowIso(),
        });
    }

    sendSafe(ws, { type: 'install:subscribed', serverId, timestamp: nowIso() });
}

export async function handleSubscribeFileTransfers(
    ws: AuthenticatedWebSocket,
    serverId: number,
    message?: WsSubscribeFileTransfersMessage
): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) {
        sendSafe(ws, { type: 'error', error: 'Access denied' });
        return;
    }

    const subs = ensureSubs(ws);
    subs.fileTransfers.add(serverId);

    const limit = parseLimit(message?.data?.limit, 20, 100);
    const jobs = await fileTransferJobRepository.listRecentForServer(serverId, limit);

    sendSafe(ws, {
        type: 'file-transfer:snapshot',
        serverId,
        jobs: jobs.map(serializeFileTransferJob),
        limit,
        timestamp: nowIso(),
    });
    sendSafe(ws, { type: 'file-transfer:subscribed', serverId, timestamp: nowIso() });
}

export async function handleUnsubscribe(
    ws: AuthenticatedWebSocket,
    channel: SubscriptionChannel,
    serverId?: number
): Promise<void> {
    const subs = ensureSubs(ws);

    if (channel === 'system-metrics') {
        subs.systemMetrics = false;
        sendSafe(ws, { type: 'unsubscribed', channel: 'system-metrics' });
        return;
    }

    if (channel === 'servers') {
        subs.servers = false;
        sendSafe(ws, { type: 'unsubscribed', channel: 'servers' });
        return;
    }

    if (channel === 'servers-metrics') {
        subs.serversMetrics = false;
        sendSafe(ws, { type: 'unsubscribed', channel: 'servers-metrics' });
        return;
    }

    if (channel === 'servers-players') {
        subs.serversPlayers = false;
        sendSafe(ws, { type: 'unsubscribed', channel: 'servers-players' });
        return;
    }

    if (!serverId) {
        sendSafe(ws, { type: 'error', error: 'Missing serverId' });
        return;
    }

    if (channel === 'logs') {
        subs.logs.delete(serverId);

        if (ws.logStreams?.[serverId]) {
            ws.logStreams[serverId].stop();
            delete ws.logStreams[serverId];
        }
    }

    if (channel === 'actions') {
        subs.actions.delete(serverId);
        sendSafe(ws, { type: 'unsubscribed', channel: 'actions', serverId });
        return;
    }

    if (channel === 'install') subs.install.delete(serverId);
    if (channel === 'file-transfers') subs.fileTransfers.delete(serverId);
    if (channel === 'status') subs.status.delete(serverId);

    sendSafe(ws, { type: 'unsubscribed', channel, serverId });
}

export async function handleSubscribeServersMetrics(ws: AuthenticatedWebSocket): Promise<void> {
    const subs = ensureSubs(ws);
    subs.serversMetrics = true;

    sendSafe(ws, { type: 'servers-metrics:subscribed', timestamp: nowIso() });

    sendSafe(ws, {
        type: 'servers-metrics:update',
        metrics: getServerMetricsSamples(),
        timestamp: nowIso(),
    });
}

export async function handleSubscribeServersPlayers(ws: AuthenticatedWebSocket): Promise<void> {
    const subs = ensureSubs(ws);
    subs.serversPlayers = true;

    sendSafe(ws, { type: 'servers-players:subscribed', timestamp: nowIso() });

    if (!hasPlayersSamples()) {
        try {
            await refreshPlayersCache();
        } catch (error) {
            logError('WS:SUB:SERVERS_PLAYERS', error);
        }
    }

    const canSeePlayers = await buildServerPermissionVisibility(ws, PERMISSIONS.server.playersRead);

    sendSafe(ws, {
        type: 'servers-players:update',
        players: getPlayersSamples().filter((sample) => canSeePlayers(sample.serverId)),
        timestamp: nowIso(),
    });
}

export async function handleSubscribeSystemMetrics(
    ws: AuthenticatedWebSocket,
    message?: WsSubscribeSystemMetricsMessage
): Promise<void> {
    const subs = ensureSubs(ws);
    subs.systemMetrics = true;

    const historyLimit = parseLimit(message?.data?.limit, 200, 2000);

    try {
        const raw = await systemMetricsRepository.getRecentForLastDays(1, METRICS_HISTORY_RAW_LIMIT);
        const { points, meta } = buildMetricsHistory(raw, historyLimit);

        sendSafe(ws, {
            type: 'system-metrics:history',
            metrics: points,
            limit: historyLimit,
            timestamp: nowIso(),
            meta,
        });
    } catch (error) {
        logError('WS:SUB:SYSTEM_METRICS', error);
        sendSafe(ws, { type: 'system-metrics:history', metrics: [], limit: historyLimit, timestamp: nowIso() });
    }

    sendSafe(ws, { type: 'system-metrics:subscribed', timestamp: nowIso() });
}
