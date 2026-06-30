import { spawn } from 'node:child_process';
import { PROCESS_SIGKILL_DELAY_MS } from './constants.js';
import type { CommandResult } from './types.js';
import { logError } from '../../../../utils/logger.js';

export function appendCapped(current: string, chunk: string, maxLength = 128 * 1024): string {
    const next = current + chunk;
    if (next.length <= maxLength) return next;
    return next.slice(next.length - maxLength);
}

export async function runCommand(
    command: string,
    args: string[],
    options: {
        cwd?: string;
        env?: Record<string, string>;
        onOutput?: (text: string) => void;
        timeoutMs?: number;
        onTimeout?: () => void | Promise<void>;
        onSpawn?: (kill: () => void) => void;
    } = {}
): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: { ...process.env, ...(options.env ?? {}) },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let sigkillTimer: ReturnType<typeof setTimeout> | null = null;
        const timeoutTimer = options.timeoutMs
            ? setTimeout(() => {
                timedOut = true;
                Promise.resolve(options.onTimeout?.()).catch((error) => {
                    logError('HYTALE:COMMAND_TIMEOUT_CALLBACK', error);
                });
                child.kill('SIGTERM');
                sigkillTimer = setTimeout(() => child.kill('SIGKILL'), PROCESS_SIGKILL_DELAY_MS);
            }, options.timeoutMs)
            : null;

        options.onSpawn?.(() => {
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), PROCESS_SIGKILL_DELAY_MS);
        });

        child.stdout.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf-8');
            stdout = appendCapped(stdout, text);
            options.onOutput?.(text);
        });

        child.stderr.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf-8');
            stderr = appendCapped(stderr, text);
            options.onOutput?.(text);
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (timeoutTimer) clearTimeout(timeoutTimer);
            if (sigkillTimer) clearTimeout(sigkillTimer);
            resolve({
                exitCode: Number(code ?? -1),
                stdout,
                stderr,
                timedOut,
            });
        });
    });
}
