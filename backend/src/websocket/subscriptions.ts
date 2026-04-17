import WebSocket from 'ws';
import type { AuthenticatedWebSocket, SubscriptionsState, SubscriptionChannel, WSMessage } from './types.js';
import { sendSafe } from './auth.js';
import {
    serverRepository,
    actionsRepository,
    installProgressRepository,
    serverMetricsRepository,
    systemMetricsRepository,
} from '../database/index.js';
import * as dockerUtils from '../utils/docker.js';
import type { WebSocketServer } from 'ws';
import { subscribeConsoleStatus, unsubscribeConsoleStatus } from './pollers/consoleStatusPoller.js';
import { logError } from '../utils/logger.js';
import { nowIso, toIsoTimestamp } from '../utils/time.js';
import type { InstallationProgressRow, ServerActionRow } from '../types/database.js';
import type { GameServerRow } from '../types/gameServer.js';

export const round2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

type MetricRow = Record<string, any> & {
    timestamp?: string;
    ts?: number;
};

function parseLimit(raw: unknown, fallback = 100, max = 2000): number {
    const n = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(n, max);
}

function parseSqliteTimestampToMs(ts: string): number {
    // SQLite CURRENT_TIMESTAMP = "YYYY-MM-DD HH:MM:SS"
    // Convert to ISO by replacing space with 'T' and assuming UTC.
    // (SQLite CURRENT_TIMESTAMP is UTC.)
    const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : 0;
}

function bucketSizeMsForAge(ageMs: number): number {
    const H = 60 * 60_000;
    if (ageMs <= 1 * H) return 10_000;      // 0–1h: 10s
    if (ageMs <= 6 * H) return 30_000;      // 1–6h: 30s
    return 120_000;                          // 6–24h: 2min
}

function downsampleMetrics<T extends MetricRow>(
    rowsChronological: T[],
    nowMs: number,
    numericKeys: string[],
): T[] {
    const buckets = new Map<number, {
        row: any;
        count: number;
        sums: Record<string, number>;
        firstMs: number;
    }>();

    for (const r of rowsChronological) {
        const tMs = typeof r.ts === 'number' ? r.ts : (r.timestamp ? parseSqliteTimestampToMs(r.timestamp) : 0);
        if (!tMs) continue;

        const ageMs = nowMs - tMs;
        if (ageMs < 0 || ageMs > 24 * 60 * 60_000) continue;

        const bucketMs = bucketSizeMsForAge(ageMs);
        const bucketStart = Math.floor(tMs / bucketMs) * bucketMs;

        let b = buckets.get(bucketStart);
        if (!b) {
            const base: any = { ...r };
            base.timestamp = new Date(bucketStart).toISOString();
            base.ts = bucketStart;

            b = {
                row: base,
                count: 0,
                sums: Object.fromEntries(numericKeys.map((k) => [k, 0])),
                firstMs: bucketStart,
            };
            buckets.set(bucketStart, b);
        }

        b.count += 1;
        for (const k of numericKeys) {
            const v = Number((r as any)[k]);
            if (Number.isFinite(v)) b.sums[k] += v;
        }
    }

    const sorted = Array.from(buckets.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, b]) => {
            const out = { ...b.row };
            for (const k of numericKeys) {
                out[k] = round2(b.count > 0 ? b.sums[k] / b.count : out[k]);
            }
            delete (out as any).ts;

            return out as T;
        });

    return sorted;
}

export function ensureSubs(ws: AuthenticatedWebSocket): SubscriptionsState {
    ws.subs ??= {
        logs: new Set<number>(),
        actions: new Set<number>(),
        metrics: new Set<number>(),
        install: new Set<number>(),
        status: new Set<number>(),
        consoleStatus: new Set<number>(),
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

    // Unsubscribe from console status to release poller references.
    if (ws.subs?.consoleStatus) {
        for (const serverId of ws.subs.consoleStatus.values()) {
            try {
                unsubscribeConsoleStatus(ws, serverId);
            } catch {
                // Ignore cleanup errors.
            }
        }
        ws.subs.consoleStatus.clear();
    }

    // Clear remaining subscription state.
    ws.subs?.logs.clear();
    ws.subs?.actions.clear();
    ws.subs?.metrics.clear();
    ws.subs?.install.clear();
    ws.subs?.status.clear();

    if (ws.subs) {
        ws.subs.systemMetrics = false;
        ws.subs.servers = false;
    }
}

async function assertServerAccess(ws: AuthenticatedWebSocket, serverId: number) {
    const server = await serverRepository.findById(serverId);
    if (!server) return null;
    return server;
}

export async function handleSubscribeServers(
    ws: AuthenticatedWebSocket,
    _message?: WSMessage
): Promise<void> {
    const subs = ensureSubs(ws);
    subs.servers = true;

    sendSafe(ws, { type: 'servers:subscribed', timestamp: nowIso() });

    try {
        const servers = await serverRepository.listAll();

        const serversWithInstall = await Promise.all(
            servers.map(async (server: GameServerRow) => {
                const installProgress = await installProgressRepository.getByServerId(server.id);

                return {
                    ...server,
                    install_progress: installProgress as InstallationProgressRow | undefined,
                };
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
    message?: WSMessage
): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) {
        sendSafe(ws, { type: 'error', error: 'Access denied' });
        return;
    }

    const subs = ensureSubs(ws);
    subs.logs.add(serverId);

    const limit = parseLimit((message as any)?.data?.limit, 200, 1000);

    if (server.docker_container_id) {
        const containerLogs = await dockerUtils.getContainerLogs(server.docker_container_id, limit);
        sendSafe(ws, { type: 'logs:history', serverId, logs: containerLogs, limit, timestamp: nowIso() });
    } else {
        sendSafe(ws, { type: 'logs:history', serverId, logs: [], limit, timestamp: nowIso() });
    }

    sendSafe(ws, { type: 'logs:subscribed', serverId, timestamp: nowIso() });

    if (server.docker_container_id) {
        ws.logStreams = ws.logStreams ?? {};

        if (!ws.logStreams[serverId]) {
            ws.logStreams[serverId] = dockerUtils.streamContainerLogs(server.docker_container_id, (line) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                if (!ws.subs?.logs.has(serverId)) return;

                sendSafe(ws, {
                    type: 'logs:new',
                    serverId,
                    lines: [line],
                    timestamp: nowIso(),
                });
            });
        }
    }
}

export async function handleSubscribeActions(
    ws: AuthenticatedWebSocket,
    serverId: number,
    message?: WSMessage
): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) {
        sendSafe(ws, { type: 'error', error: 'Access denied' });
        return;
    }

    const subs = ensureSubs(ws);
    subs.actions.add(serverId);

    const limit = parseLimit((message as any)?.data?.limit, 200, 2000);

    try {
        const rows = await actionsRepository.getRecent(serverId, limit);

        const actions = rows
            .reverse()
            .map((row: ServerActionRow) => ({
                id: row.id,
                server_id: row.server_id,
                level: row.level,
                message: row.message,
                actor_username: row.actor_username ?? null,
                timestamp: toIsoTimestamp(row.timestamp),
            }));

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

export async function handleSubscribeConsoleStatus(
    wss: WebSocketServer,
    ws: AuthenticatedWebSocket,
    serverId: number
): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) { sendSafe(ws, { type: 'error', error: 'Access denied' }); return; }


    const subs = ensureSubs(ws);
    subs.consoleStatus.add(serverId);

    subscribeConsoleStatus(wss, ws, serverId);

    // ack (useful for front state)
    sendSafe(ws, { type: 'console-status:subscribed', serverId, timestamp: nowIso() });
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
    sendSafe(ws, {
        type: 'install:progress',
        serverId,
        progress: progress?.progress_percent ?? 0,
        status: progress?.status ?? 'pending',
        errorMessage: progress?.error_message ?? null,
        timestamp: nowIso(),
    });

    sendSafe(ws, { type: 'install:subscribed', serverId, timestamp: nowIso() });
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

    if (channel === 'console-status') {
        subs.consoleStatus.delete(serverId);
        unsubscribeConsoleStatus(ws, serverId);
        sendSafe(ws, { type: 'unsubscribed', channel: 'console-status', serverId });
        return;
    }

    if (channel === 'install') subs.install.delete(serverId);
    if (channel === 'metrics') subs.metrics.delete(serverId);
    if (channel === 'status') subs.status.delete(serverId);

    sendSafe(ws, { type: 'unsubscribed', channel, serverId });
}

/**
 * Server metrics subscription:
 * - adds the serverId to the subscription set
 * - sends DB history immediately
 * - realtime updates are pushed by the global server metrics poller
 */
export async function handleSubscribeMetrics(
    ws: AuthenticatedWebSocket,
    serverId: number,
    message?: WSMessage
): Promise<void> {
    const server = await assertServerAccess(ws, serverId);
    if (!server) {
        sendSafe(ws, { type: 'error', error: 'Access denied' });
        return;
    }

    const subs = ensureSubs(ws);
    subs.metrics.add(serverId);

    const historyLimit = parseLimit((message as any)?.data?.limit, 100, 2000);

    try {
        const rawLimit = 10_000;

        const raw = await serverMetricsRepository.getRecentForLastDays(serverId, 1, rawLimit);
        const chronological = raw.reverse(); // oldest -> newest

        const nowMs = Date.now();
        const downsampled = downsampleMetrics(chronological, nowMs, ['cpu_usage', 'memory_usage']);

        // Apply final limit from the newest side (keep the most recent N points)
        const final =
            downsampled.length > historyLimit ? downsampled.slice(downsampled.length - historyLimit) : downsampled;

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

export async function handleSubscribeSystemMetrics(ws: AuthenticatedWebSocket, message?: WSMessage): Promise<void> {
    const subs = ensureSubs(ws);
    subs.systemMetrics = true;

    const historyLimit = parseLimit((message as any)?.data?.limit, 200, 2000);

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

        const final =
            downsampled.length > historyLimit ? downsampled.slice(downsampled.length - historyLimit) : downsampled;

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
