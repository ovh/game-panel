import WebSocket, { type WebSocketServer } from 'ws';
import { serverRepository, serverMetricsRepository } from '../../database/index.js';
import * as dockerUtils from '../../utils/docker.js';
import type { AuthenticatedWebSocket } from '../types.js';
import { sendSafe } from '../auth.js';
import { round2 } from '../subscriptions.js';
import { logError } from '../../utils/logger.js';
import { nowIso } from '../../utils/time.js';

const RETENTION_DAYS = 1;
const PRUNE_EVERY_MS = 30 * 60_000;
let lastPruneAt = 0;

type ServerMetricsPollerOptions = {
    intervalMs?: number;
};

export function startServerMetricsPoller(wss: WebSocketServer, opts?: ServerMetricsPollerOptions): NodeJS.Timeout {
    const intervalMs = opts?.intervalMs ?? 10_000;

    const timer = setInterval(async () => {
        try {
            const now = Date.now();
            if (now - lastPruneAt > PRUNE_EVERY_MS) {
                lastPruneAt = now;
                try {
                    await serverMetricsRepository.pruneOlderThanDays(RETENTION_DAYS);
                } catch (e) {
                    logError('WS:POLLER:SERVER_METRICS_PRUNE', e);
                }
            }

            const runningServers = await serverRepository.findRunningServers();

            for (const server of runningServers) {
                if (!server?.docker_container_id) continue;

                let containerStatus = 'unknown';
                try {
                    containerStatus = await dockerUtils.checkContainerStatus(server.docker_container_id);
                } catch {
                    continue;
                }
                if (containerStatus !== 'running') continue;

                const stats = await dockerUtils.getContainerStats(server.docker_container_id);

                // Store one row per tick
                await serverMetricsRepository.create(server.id, stats.cpuUsage, stats.memoryUsage);

                const payload = {
                    type: 'metrics:update',
                    serverId: server.id,
                    metrics: {
                        cpuUsage: round2(stats.cpuUsage), // %
                        memoryUsage: round2(stats.memoryUsage), // %
                        // memoryBytes: stats.memoryBytes, // bytes
                    },
                    timestamp: nowIso(),
                };

                wss.clients.forEach((client) => {
                    const ws = client as AuthenticatedWebSocket;
                    if (ws.readyState !== WebSocket.OPEN) return;
                    if (!ws.userId) return;
                    if (!ws.subs?.metrics?.has(server.id)) return;

                    sendSafe(ws, payload);
                });
            }
        } catch (error) {
            logError('WS:POLLER:SERVER_METRICS', error);
        }
    }, intervalMs);

    return timer;
}
