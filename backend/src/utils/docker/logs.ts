import { PassThrough } from 'stream';
import { docker } from './client.js';

export async function getContainerLogs(containerId: string, tail = 50): Promise<string[]> {
    const container = docker.getContainer(containerId);

    const raw = (await container.logs({
        stdout: true,
        stderr: true,
        timestamps: true,
        tail,
    })) as any;

    const buf: Buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);

    const chunks: Buffer[] = [];
    let i = 0;
    const looksMultiplexed = buf.length >= 8 && (buf[0] === 1 || buf[0] === 2);

    if (looksMultiplexed) {
        while (i + 8 <= buf.length) {
            const header = buf.subarray(i, i + 8);
            const size = header.readUInt32BE(4);
            i += 8;
            if (i + size > buf.length) break;
            chunks.push(buf.subarray(i, i + size));
            i += size;
        }
    } else {
        chunks.push(buf);
    }

    const text = Buffer.concat(chunks).toString('utf-8');

    const lines = text.split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines;
}

export function streamContainerLogs(
    containerId: string,
    onLine: (line: string) => void,
    opts?: { since?: number }
): { stop: () => void } {
    const container = docker.getContainer(containerId);

    let stopped = false;
    let logStream: NodeJS.ReadableStream | null = null;

    const stdout = new PassThrough();
    const stderr = new PassThrough();

    const handleChunk = (chunk: Buffer) => {
        if (stopped) return;

        chunk
            .toString('utf-8')
            .split(/\r?\n/)
            .forEach((line, idx, arr) => {
                if (idx === arr.length - 1 && line === '') return;

                onLine(line);
            });
    };

    stdout.on('data', handleChunk);
    stderr.on('data', handleChunk);

    (async () => {
        try {
            logStream = (await container.logs({
                follow: true,
                stdout: true,
                stderr: true,
                timestamps: true,
                since: opts?.since ?? 0,
                tail: 0,
            })) as unknown as NodeJS.ReadableStream;

            (docker as any).modem.demuxStream(logStream, stdout, stderr);
        } catch {
            // Ignore log-stream setup errors.
        }
    })();

    const stop = () => {
        if (stopped) return;
        stopped = true;

        try {
            stdout.removeAllListeners();
            stderr.removeAllListeners();
            stdout.destroy();
            stderr.destroy();
        } catch {
            // Ignore stream teardown errors.
        }

        try {
            if (logStream) {
                logStream.removeAllListeners();
                (logStream as any).destroy?.();
            }
        } catch {
            // Ignore stream teardown errors.
        }
    };

    return { stop };
}
