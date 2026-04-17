import WebSocket, { type WebSocketServer } from 'ws';
import { systemMetricsRepository } from '../../database/index.js';
import * as systemUtils from '../../utils/system.js';
import type { AuthenticatedWebSocket } from '../types.js';
import { sendSafe } from '../auth.js';
import { round2 } from '../subscriptions.js';
import { logError } from '../../utils/logger.js';
import { nowIso } from '../../utils/time.js';

const RETENTION_DAYS = 1;
const PRUNE_EVERY_MS = 30 * 60_000;
let lastPruneAt = 0;

type SystemMetricsPollerOptions = {
    intervalMs?: number;
};

export function startSystemMetricsPoller(wss: WebSocketServer, opts?: SystemMetricsPollerOptions): NodeJS.Timeout {
    const intervalMs = opts?.intervalMs ?? 10_000;

    const timer = setInterval(async () => {
        try {
            const now = Date.now();
            if (now - lastPruneAt > PRUNE_EVERY_MS) {
                lastPruneAt = now;
                try {
                    await systemMetricsRepository.pruneOlderThanDays(RETENTION_DAYS);
                } catch (e) {
                    logError('WS:POLLER:SYSTEM_METRICS_PRUNE', e);
                }
            }

            const stats = await systemUtils.getSystemStats();

            // Store one row per tick (global, not per client)
            await systemMetricsRepository.create(
                stats.cpuUsage,
                stats.memoryUsage,
                stats.diskUsage,
                stats.networkUsage.in,
                stats.networkUsage.out
            );

            const payload = {
                type: 'system-metrics:update',
                metrics: {
                    cpuUsage: round2(stats.cpuUsage),
                    memoryUsage: round2(stats.memoryUsage),
                    disk: stats.diskUsage,
                    network: stats.networkUsage,
                },
                timestamp: nowIso(),
            };

            // Broadcast only to subscribed clients
            wss.clients.forEach((client) => {
                const ws = client as AuthenticatedWebSocket;
                if (ws.readyState !== WebSocket.OPEN) return;
                if (!ws.userId) return; // requires auth
                if (!ws.subs?.systemMetrics) return;

                sendSafe(ws, payload);
            });
        } catch (error) {
            logError('WS:POLLER:SYSTEM_METRICS', error);
        }
    }, intervalMs);

    return timer;
}
