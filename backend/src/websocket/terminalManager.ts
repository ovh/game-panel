import crypto from 'node:crypto';
import type { Duplex } from 'node:stream';
import { docker } from '../utils/docker/client.js';

type TerminalKind = 'shell';

type TerminalSession = {
    sessionId: string;
    serverId: number;
    containerId: string;
    ownerUserId: number;
    kind: TerminalKind;

    execId?: string;
    exec?: any;
    stream?: Duplex;

    attachedWsIds: Set<string>;
    createdAt: number;
    lastSeenAt: number;

    // write backpressure handling
    writeQueue?: Buffer[];
    writing?: boolean;
};

const SESSIONS = new Map<string, TerminalSession>();

const MAX_SESSIONS = 5;
const UNATTACHED_TTL_MS = 60_000;

function now() {
    return Date.now();
}

function cleanupSession(sessionId: string): void {
    const s = SESSIONS.get(sessionId);
    if (!s) return;

    try {
        s.writeQueue = [];
        s.writing = false;
    } catch {
        // Ignore cleanup errors.
    }

    try {
        s.stream?.end();
    } catch {
        // Ignore cleanup errors.
    }

    try {
        s.stream?.destroy();
    } catch {
        // Ignore cleanup errors.
    }

    SESSIONS.delete(sessionId);
}

/**
 * Docker exec streams can sometimes still be multiplexed (8-byte headers),
 * even when Tty=true. This strips the mux headers and forwards only payload.
 *
 * If the stream is NOT muxed, it will forward raw data as-is.
 */
function pumpDockerMuxedStream(stream: Duplex, onPayload: (buf: Buffer) => void): () => void {
    let buffer = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        buffer = Buffer.concat([buffer, buf]);

        // Parse frames as long as we have a full header+payload
        while (buffer.length >= 8) {
            const streamType = buffer[0]; // 1=stdout, 2=stderr
            const isMuxHeader =
                (streamType === 1 || streamType === 2) &&
                buffer[1] === 0 &&
                buffer[2] === 0 &&
                buffer[3] === 0;

            if (!isMuxHeader) {
                // Not muxed: flush all and stop parsing
                onPayload(buffer);
                buffer = Buffer.alloc(0);
                return;
            }

            const size = buffer.readUInt32BE(4);
            if (buffer.length < 8 + size) return; // wait for more data

            const payload = buffer.subarray(8, 8 + size);
            if (payload.length) onPayload(payload);

            buffer = buffer.subarray(8 + size);
        }
    };

    stream.on('data', onData);

    return () => {
        try {
            stream.off('data', onData);
        } catch {
            // Ignore cleanup errors.
        }
    };
}

function pruneTerminalSessions(): void {
    const t = now();
    for (const [id, s] of SESSIONS.entries()) {
        const ref = s.lastSeenAt ?? s.createdAt;
        if (s.attachedWsIds.size === 0 && t - ref > UNATTACHED_TTL_MS) {
            cleanupSession(id);
        }
    }
}

export async function createTerminalSession(opts: {
    serverId: number;
    containerId: string;
    ownerUserId: number;
    user?: string;
    workdir?: string;
    command?: string[];
    env?: string[];
    kind?: TerminalKind;
}): Promise<{ sessionId: string }> {
    pruneTerminalSessions();

    const kind: TerminalKind = opts.kind ?? 'shell';

    if (SESSIONS.size >= MAX_SESSIONS) {
        throw new Error('Too many terminal sessions');
    }

    const sessionId = crypto.randomUUID();
    const { serverId, containerId } = opts;

    const workdir = opts.workdir;
    const cmd = opts.command ?? ['/bin/sh', '-c', 'if command -v bash >/dev/null 2>&1; then exec bash -l; else exec sh; fi'];

    const container = docker.getContainer(containerId);

    const exec = await container.exec({
        Cmd: cmd,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        ...(opts.user ? { User: opts.user } : {}),
        ...(workdir ? { WorkingDir: workdir } : {}),
        Env: ['TERM=xterm-256color', ...(opts.env ?? [])],
    });

    const stream = (await exec.start({
        hijack: true,
        stdin: true,
    })) as Duplex;

    const session: TerminalSession = {
        sessionId,
        kind,
        serverId,
        containerId,
        ownerUserId: opts.ownerUserId,

        execId: exec.id,
        exec,
        stream,

        attachedWsIds: new Set<string>(),
        createdAt: now(),
        lastSeenAt: now(),

        writeQueue: [],
        writing: false,
    };

    // cleanup on stream end/close/error
    stream.on('end', () => cleanupSession(sessionId));
    stream.on('close', () => cleanupSession(sessionId));
    stream.on('error', () => cleanupSession(sessionId));

    SESSIONS.set(sessionId, session);

    return { sessionId };
}

export function getTerminalSession(sessionId: string): TerminalSession | undefined {
    return SESSIONS.get(sessionId);
}

export function attachTerminalSession(sessionId: string, wsClientId: string): void {
    const s = SESSIONS.get(sessionId);
    if (!s) throw new Error('Unknown session');
    s.attachedWsIds.add(wsClientId);
    s.lastSeenAt = now();
}

export function detachTerminalSessionsForWs(wsClientId: string): void {
    for (const s of SESSIONS.values()) {
        if (s.attachedWsIds.has(wsClientId)) {
            s.attachedWsIds.delete(wsClientId);
            s.lastSeenAt = now();
        }
    }
}

export async function resizeTerminal(sessionId: string, size: { cols: number; rows: number }): Promise<void> {
    const s = SESSIONS.get(sessionId);
    if (!s?.exec) throw new Error('Unknown session');

    const cols = Math.max(20, Math.min(400, size.cols));
    const rows = Math.max(5, Math.min(200, size.rows));

    await s.exec.resize({ h: rows, w: cols });
}

/**
 * Writes input to the exec stream with backpressure handling.
 * This prevents weird interactive glitches when user types quickly.
 */
export function writeToTerminal(sessionId: string, data: Buffer): void {
    const s = SESSIONS.get(sessionId);
    if (!s?.stream) throw new Error('Unknown session');
    s.lastSeenAt = now();

    if (!s.writeQueue) s.writeQueue = [];
    s.writeQueue.push(data);

    if (s.writing) return;
    s.writing = true;

    const flush = () => {
        if (!s.stream) {
            s.writing = false;
            s.writeQueue = [];
            return;
        }

        while (s.writeQueue && s.writeQueue.length > 0) {
            const chunk = s.writeQueue.shift()!;
            const ok = s.stream.write(chunk);
            if (!ok) {
                s.stream.once('drain', flush);
                return;
            }
        }

        s.writing = false;
    };

    flush();
}

export function onTerminalData(sessionId: string, cb: (chunk: Buffer) => void): (() => void) {
    const s = SESSIONS.get(sessionId);
    if (!s?.stream) throw new Error('Unknown session');

    const unsubscribe = pumpDockerMuxedStream(s.stream, cb);

    return () => {
        try {
            unsubscribe();
        } catch {
            // Ignore cleanup errors.
        }
    };
}
