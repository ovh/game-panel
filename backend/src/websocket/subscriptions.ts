import WebSocket, { type WebSocketServer } from 'ws';
import type {
    AuthenticatedWebSocket,
    SubscriptionsState,
    SubscriptionChannel,
    WsSubscribeActionsMessage,
    WsSubscribeFileTransfersMessage,
    WsSubscribeLogsMessage,
    WsSubscribeMetricsMessage,
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
    serverMetricsRepository,
    systemMetricsRepository,
} from '../database/index.js';
import { serializeFileTransferJob } from '../database/repositories/fileTransferJobRepository.js';
import * as dockerUtils from '../utils/docker.js';
import { logError } from '../utils/logger.js';
import { buildServerEnvVisibility } from '../middleware/auth.js';
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
import { downsampleMetrics, parseLimit, serializeMetricPoint } from './metricsSerialization.js';

export function ensureSubs(ws: AuthenticatedWebSocket): SubscriptionsState {
    ws.subs ??= {
        logs: new Set<number>(),
        actions: new Set<number>(),
        metrics: new Set<number>(),
        install: new Set<number>(),
        status: new Set<number>(),
        fileTransfers: new Set<number>(),
        systemMetrics: false,
        servers: false,
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
    ws.subs?.metrics.clear();
    ws.subs?.install.clear();
    ws.subs?.status.clear();
    ws.subs?.fileTransfers.clear();

    if (ws.subs) {
        ws.subs.systemMetrics = false;
        ws.subs.servers = false;
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
    if (channel === 'metrics') subs.metrics.delete(serverId);
    if (channel === 'status') subs.status.delete(serverId);

    sendSafe(ws, { type: 'unsubscribed', channel, serverId });
}

export async function handleSubscribeMetrics(
    ws: AuthenticatedWebSocket,
    serverId: number,
    message?: WsSubscribeMetricsMessage
): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) {
        sendSafe(ws, { type: 'error', error: 'Access denied' });
        return;
    }

    const subs = ensureSubs(ws);
    subs.metrics.add(serverId);

    const historyLimit = parseLimit(message?.data?.limit, 100, 2000);

    try {
        const rawLimit = 10_000;

        const raw = await serverMetricsRepository.getRecentForLastDays(serverId, 1, rawLimit);
        const chronological = raw.reverse(); // oldest -> newest

        const nowMs = Date.now();
        const downsampled = downsampleMetrics(chronological, nowMs, [
            'cpu_usage',
            'memory_usage',
            'disk_usage',
            'network_in',
            'network_out',
        ]);

        // Apply final limit from the newest side (keep the most recent N points)
        const finalRows =
            downsampled.length > historyLimit ? downsampled.slice(downsampled.length - historyLimit) : downsampled;
        const final = finalRows.map(serializeMetricPoint);

        sendSafe(ws, {
            type: 'metrics:history',
            serverId,
            metrics: final,
            limit: historyLimit,
            timestamp: nowIso(),
            meta: {
                window: '24h',
                downsample: '0-1h:10s,1-6h:30s,6-24h:120s',
                rawCount: raw.length,
                sentCount: final.length,
            },
        });
    } catch (error) {
        logError('WS:SUB:METRICS', error);
        sendSafe(ws, { type: 'metrics:history', serverId, metrics: [], limit: historyLimit, timestamp: nowIso() });
    }

    sendSafe(ws, { type: 'metrics:subscribed', serverId, timestamp: nowIso() });
}

export async function handleSubscribeSystemMetrics(
    ws: AuthenticatedWebSocket,
    message?: WsSubscribeSystemMetricsMessage
): Promise<void> {
    const subs = ensureSubs(ws);
    subs.systemMetrics = true;

    const historyLimit = parseLimit(message?.data?.limit, 200, 2000);

    try {
        const rawLimit = 10_000;

        const raw = await systemMetricsRepository.getRecentForLastDays(1, rawLimit);
        const chronological = raw.reverse();

        const nowMs = Date.now();
        const downsampled = downsampleMetrics(chronological, nowMs, [
            'cpu_usage',
            'memory_usage',
            'disk_usage',
            'network_in',
            'network_out',
        ]);

        const finalRows =
            downsampled.length > historyLimit ? downsampled.slice(downsampled.length - historyLimit) : downsampled;
        const final = finalRows.map(serializeMetricPoint);

        sendSafe(ws, {
            type: 'system-metrics:history',
            metrics: final,
            limit: historyLimit,
            timestamp: nowIso(),
            meta: {
                window: '24h',
                downsample: '0-1h:10s,1-6h:30s,6-24h:120s',
                rawCount: raw.length,
                sentCount: final.length,
            },
        });
    } catch (error) {
        logError('WS:SUB:SYSTEM_METRICS', error);
        sendSafe(ws, { type: 'system-metrics:history', metrics: [], limit: historyLimit, timestamp: nowIso() });
    }

    sendSafe(ws, { type: 'system-metrics:subscribed', timestamp: nowIso() });
}
