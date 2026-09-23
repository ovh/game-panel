import WebSocket, { type WebSocketServer } from 'ws';
import { buildServerPermissionVisibility } from '../../middleware/auth.js';
import { PERMISSIONS } from '../../permissions.js';
import { refreshPlayersCache, resetPlayersCache } from '../../services/players/fleet.js';
import { logError } from '../../utils/logger.js';
import { getPlayersSamples } from '../../utils/playersCache.js';
import { nowIso } from '../../utils/time.js';
import { sendSafe } from '../auth.js';
import type { AuthenticatedWebSocket } from '../types.js';

type ServerPlayersPollerOptions = {
    intervalMs?: number;
};

function collectSubscribers(wss: WebSocketServer): AuthenticatedWebSocket[] {
    const targets: AuthenticatedWebSocket[] = [];

    for (const client of wss.clients) {
        const ws = client as AuthenticatedWebSocket;
        if (ws.readyState !== WebSocket.OPEN) continue;
        if (!ws.userId) continue;
        if (!ws.subs?.serversPlayers) continue;

        targets.push(ws);
    }

    return targets;
}

async function broadcastPlayers(targets: AuthenticatedWebSocket[]): Promise<void> {
    const samples = getPlayersSamples();
    const timestamp = nowIso();

    for (const ws of targets) {
        const canSeePlayers = await buildServerPermissionVisibility(ws, PERMISSIONS.server.playersRead);

        sendSafe(ws, {
            type: 'servers-players:update',
            players: samples.filter((sample) => canSeePlayers(sample.serverId)),
            timestamp,
        });
    }
}

export function startServerPlayersPoller(
    wss: WebSocketServer,
    opts?: ServerPlayersPollerOptions
): NodeJS.Timeout {
    const intervalMs = opts?.intervalMs ?? 10_000;

    const timer = setInterval(async () => {
        try {
            const targets = collectSubscribers(wss);

            if (targets.length === 0) {
                resetPlayersCache();
                return;
            }

            await refreshPlayersCache();
            await broadcastPlayers(targets);
        } catch (error) {
            logError('WS:POLLER:SERVER_PLAYERS', error);
        }
    }, intervalMs);

    return timer;
}
