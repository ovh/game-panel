import type { WebSocketServer } from 'ws';
import type { AuthenticatedWebSocket } from '../types.js';
import { sendSafe } from '../auth.js';
import { docker } from '../../utils/docker/client.js';
import { serverRepository } from '../../database/index.js';
import { nowIso } from '../../utils/time.js';
import { isConsoleSessionInUse } from '../terminalManager.js';

type Entry = {
    serverId: number;
    timer: NodeJS.Timeout;
    subscribers: Set<string>;
    lastReady: boolean | null;
    lastBusy: boolean | null;
};

const REGISTRY = new Map<number, Entry>();

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeSessionName(raw?: string): string {
    const s = String(raw ?? '').trim();
    // tmux session name: keep it simple, allow alnum _ - .
    if (!s) return '';
    return s.replace(/[^a-zA-Z0-9_.-]/g, '');
}

async function detectConsoleReady(containerId: string, sessionName?: string): Promise<boolean> {
    const container = docker.getContainer(containerId);

    const safeSession = sanitizeSessionName(sessionName);
    const safeSessionRegex = escapeRegex(safeSession);

    const cmd = [
        'bash',
        '-lc',
        `
set +e
uid="$(id -u)"
dir="/tmp/tmux-$uid"
SESSION="${safeSession}"

# If no tmux dir => not ready
if [ ! -d "$dir" ]; then
  echo "READY=0"
  exit 0
fi

# Missing expected LinuxGSM session name => not ready.
if [ -z "$SESSION" ]; then
  echo "READY=0"
  exit 0
fi

# Find tmux socket for "<session>-xxxx" and verify the exact target session.
sock="$(ls -1 "$dir" 2>/dev/null | grep -E "^${safeSessionRegex}-" | head -n 1 || true)"
if [ -z "$sock" ]; then
  echo "READY=0"
  exit 0
fi

tmux -L "$sock" has-session -t "$SESSION" >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "READY=1"
else
  echo "READY=0"
fi
    `.trim(),
    ];

    const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        User: 'linuxgsm',
        WorkingDir: '/data',
        Env: ['TERM=xterm-256color'],
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
        stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        stream.on('end', resolve);
        stream.on('close', resolve);
        stream.on('error', resolve);
    });

    const raw = Buffer.concat(chunks).toString('utf-8');

    // Parse stable marker even if TTY injects extra chars
    const m = raw.match(/READY=(0|1)/);
    return m?.[1] === '1';
}

async function tick(wss: WebSocketServer, serverId: number): Promise<void> {
    const e = REGISTRY.get(serverId);
    if (!e) return;

    const activeClientIds = new Set<string>();
    for (const client of wss.clients) {
        const cid = ((client as AuthenticatedWebSocket) as any)._gpClientId as string | undefined;
        if (cid) activeClientIds.add(cid);
    }

    for (const subscriberId of Array.from(e.subscribers)) {
        if (!activeClientIds.has(subscriberId)) {
            e.subscribers.delete(subscriberId);
        }
    }

    // stop poller if no subscribers
    if (e.subscribers.size === 0) {
        clearInterval(e.timer);
        REGISTRY.delete(serverId);
        return;
    }

    // fetch server from DB
    const server = await serverRepository.findById(serverId);
    if (!server) {
        clearInterval(e.timer);
        REGISTRY.delete(serverId);
        return;
    }

    if (!server.docker_container_id) {
        const busy = isConsoleSessionInUse(serverId);
        if (e.lastReady !== false || e.lastBusy !== busy) {
            e.lastReady = false;
            e.lastBusy = busy;
            for (const client of wss.clients) {
                const c = client as AuthenticatedWebSocket;
                const cid = (c as any)._gpClientId as string;
                if (!cid || !e.subscribers.has(cid)) continue;
                sendSafe(c, { type: 'console:status', serverId, ready: false, busy, timestamp: nowIso() });
            }
        }
        return;
    }

    const sessionName = server.game_server_name || undefined;

    let ready = false;
    try {
        ready = await detectConsoleReady(server.docker_container_id, sessionName);
    } catch {
        ready = false;
    }
    const busy = isConsoleSessionInUse(serverId);

    if (e.lastReady === ready && e.lastBusy === busy) return;
    e.lastReady = ready;
    e.lastBusy = busy;

    // broadcast only to subscribers
    for (const client of wss.clients) {
        const c = client as AuthenticatedWebSocket;
        const cid = (c as any)._gpClientId as string;
        if (!cid || !e.subscribers.has(cid)) continue;
        sendSafe(c, { type: 'console:status', serverId, ready, busy, timestamp: nowIso() });
    }

}

export function subscribeConsoleStatus(wss: WebSocketServer, ws: AuthenticatedWebSocket, serverId: number) {
    const wsClientId = (ws as any)._gpClientId as string;
    if (!wsClientId) return;

    let entry = REGISTRY.get(serverId);

    if (!entry) {
        entry = {
            serverId,
            subscribers: new Set<string>(),
            lastReady: null,
            lastBusy: null,
            timer: setInterval(() => {
                // Never let interval errors bubble and kill the poller loop.
                tick(wss, serverId).catch(() => { });
            }, 3_000),
        };

        REGISTRY.set(serverId, entry);
    }

    entry.subscribers.add(wsClientId);

    tick(wss, serverId).catch(() => { });
}

export function unsubscribeConsoleStatus(ws: AuthenticatedWebSocket, serverId: number) {
    const wsClientId = (ws as any)._gpClientId as string;
    if (!wsClientId) return;

    const entry = REGISTRY.get(serverId);
    if (!entry) return;

    entry.subscribers.delete(wsClientId);
}
