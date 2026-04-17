import express, { type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { parseServerId } from './servers.js';
import { getServerOrThrow } from '../services/servers.js';
import { createTerminalSession } from '../websocket/terminalManager.js';
import { logError } from '../utils/logger.js';
import { docker } from '../utils/docker/client.js';

const router = express.Router({ mergeParams: true });

function sanitizeSessionName(raw: string): string {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    return value.replace(/[^a-zA-Z0-9_.-]/g, '');
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function isConsoleSessionReady(containerId: string, sessionName: string): Promise<boolean> {
    const safeSession = sanitizeSessionName(sessionName);
    if (!safeSession) return false;
    const safeSessionRegex = escapeRegex(safeSession);

    const container = docker.getContainer(containerId);
    const cmd = [
        'bash',
        '-lc',
        `
set +e
uid="$(id -u)"
dir="/tmp/tmux-$uid"
SESSION="${safeSession}"

if [ -z "$SESSION" ] || [ ! -d "$dir" ]; then
  echo "READY=0"
  exit 0
fi

sock="$(ls -1 "$dir" 2>/dev/null | grep -E "^${safeSessionRegex}-" | head -n1 || true)"
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
        stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        stream.on('end', resolve);
        stream.on('close', resolve);
        stream.on('error', resolve);
    });

    const raw = Buffer.concat(chunks).toString('utf-8');
    const match = raw.match(/READY=(0|1)/);
    return match?.[1] === '1';
}

// POST /api/servers/:id/terminal/sessions
router.post('/sessions', requireServerPermission('ssh.terminal'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const server = await getServerOrThrow(serverId);

        const { sessionId } = await createTerminalSession({
            serverId,
            containerId: server.docker_container_id,
            ownerUserId: req.user!.userId,
            user: 'linuxgsm',
            workdir: '/data',
        });

        return res.json({ sessionId });
    } catch (err: any) {
        logError('ROUTE:TERMINAL:SESSION', err, { serverId: req.params.id });
        return res.status(500).json({ error: 'Terminal session error' });
    }
});

// POST /api/servers/:id/terminal/console/sessions
router.post(
    '/console/sessions',
    requireServerPermission('server.console'),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = parseServerId(req.params.id);
            if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

            const server = await getServerOrThrow(serverId);

            const script = sanitizeSessionName(server.game_server_name);
            if (!script) {
                return res.status(500).json({ error: 'Invalid game server session name' });
            }
            const scriptRegex = escapeRegex(script);

            if (!server.docker_container_id) {
                return res.status(409).json({ error: 'Console is not available for this server.' });
            }

            const ready = await isConsoleSessionReady(server.docker_container_id, script);
            if (!ready) {
                return res.status(409).json({ error: `Console is not ready.` });
            }

            const cmd = [
                'bash',
                '-lc',
                `
                    set +e
                    uid="$(id -u)"
                    dir="/tmp/tmux-$uid"
                    SESSION="${script}"

                    if [ -z "$SESSION" ] || [ ! -d "$dir" ]; then
                    echo "No tmux socket found for ${script}. Start it first (./${script} start)."
                    exit 1
                    fi

                    sock="$(ls -1 "$dir" 2>/dev/null | grep -E '^${scriptRegex}-' | head -n1 || true)"

                    if [ -z "$sock" ]; then
                    echo "No tmux socket found for ${script}. Start it first (./${script} start)."
                    exit 1
                    fi

                    tmux -L "$sock" has-session -t "$SESSION" >/dev/null 2>&1
                    if [ $? -ne 0 ]; then
                    echo "No tmux session found for ${script}."
                    exit 1
                    fi

                    exec tmux -L "$sock" attach -t "$SESSION"
                `.trim(),
            ];

            const { sessionId } = await createTerminalSession({
                serverId,
                containerId: server.docker_container_id,
                ownerUserId: req.user!.userId,
                user: 'linuxgsm',
                workdir: '/data',
                command: cmd,
                kind: 'console',
                consoleSessionName: script,
            });

            return res.json({ sessionId });
        } catch (err: any) {
            logError('ROUTE:TERMINAL:CONSOLE_SESSION', err, { serverId: req.params.id });
            return res.status(500).json({ error: 'Terminal session error' });
        }
    });

export default router;
