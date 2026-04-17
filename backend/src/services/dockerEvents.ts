import { docker } from '../utils/docker/client.js';
import { serverRepository } from '../database/index.js';
import type { ServerStatus } from '../types/gameServer.js';
import {
    completeServerTransition,
    mapDockerHealthToServerStatus,
    shouldIgnoreDockerHealthStatus,
} from './serverTransitions.js';

type HealthStatus = 'healthy' | 'unhealthy' | 'starting';

async function applyDockerHealthStatus(serverId: number, health: HealthStatus): Promise<void> {
    const current = await serverRepository.findById(serverId);
    if (!current) return;

    if (shouldIgnoreDockerHealthStatus(serverId, health)) {
        return;
    }

    const nextStatus = mapDockerHealthToServerStatus(current.status as ServerStatus, health);

    if (nextStatus === 'running') {
        await completeServerTransition(serverId, 'running');
        return;
    }

    await serverRepository.updateStatusIfChanged(serverId, nextStatus);
}

function safeJsonParse(line: string): any | null {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
}

/**
 * One-shot sync at boot: reads current container health and updates DB.
 */
export async function reconcileDockerHealthToDb(): Promise<void> {
    const containers = await docker.listContainers({
        all: true,
        filters: {
            label: ['gamepanel.managed=true'],
        } as any,
    });

    for (const c of containers) {
        const containerId = c.Id;
        const labels = c.Labels ?? {};
        const serverIdStr = labels['gamepanel.serverId'];
        const serverId = serverIdStr ? Number(serverIdStr) : null;

        if (!serverId || !Number.isFinite(serverId)) continue;

        try {
            const inspect = await docker.getContainer(containerId).inspect();

            const health: HealthStatus | null =
                (inspect?.State?.Health?.Status as HealthStatus | undefined) ?? null;

            if (!health) continue;

            await applyDockerHealthStatus(serverId, health);
        } catch (e) {
            console.warn('[dockerEvents] reconcile inspect failed:', containerId, e);
        }
    }
}

export function startDockerHealthEventListener(): { stop: () => void } {
    let stopped = false;
    let stream: NodeJS.ReadableStream | null = null;

    const startStream = async () => {
        if (stopped) return;

        try {
            stream = (await docker.getEvents()) as unknown as NodeJS.ReadableStream;

            let buffer = '';

            stream.on('data', async (chunk: Buffer) => {
                buffer += chunk.toString('utf-8');

                let idx: number;
                while ((idx = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, idx).trim();
                    buffer = buffer.slice(idx + 1);

                    if (!line) continue;

                    const evt = safeJsonParse(line);
                    if (!evt) continue;

                    if (evt.Type !== 'container') continue;
                    if (typeof evt.Action !== 'string') continue;
                    if (!evt.Action.startsWith('health_status:')) continue;

                    const action = evt.Action; // e.g. "health_status: healthy"
                    const health = action.split(':')[1]?.trim() as HealthStatus | undefined;
                    if (!health) continue;

                    const attrs = evt.Actor?.Attributes ?? {};
                    const serverIdStr = attrs['gamepanel.serverId'];
                    const serverIdNum = serverIdStr ? Number(serverIdStr) : NaN;

                    if (!Number.isFinite(serverIdNum) || serverIdNum <= 0) {
                        continue;
                    }

                    const serverId = serverIdNum;

                    try {
                        await applyDockerHealthStatus(serverId, health);
                    } catch (e) {
                        console.warn('[dockerEvents] updateStatusIfChanged failed:', { serverId, health }, e);
                    }
                }
            });

            stream.on('end', () => {
                if (stopped) return;
                console.warn('[dockerEvents] Docker event stream ended. Reconnecting...');
                setTimeout(() => startStream().catch(() => { }), 1000);
            });

            stream.on('error', (err) => {
                if (stopped) return;
                console.warn('[dockerEvents] Docker event stream error. Reconnecting...', err);
                setTimeout(() => startStream().catch(() => { }), 1000);
            });

            console.log('Listening to Docker health_status events');
        } catch (err) {
            if (stopped) return;
            console.warn('[dockerEvents] Failed to open Docker event stream. Retrying...', err);
            setTimeout(() => startStream().catch(() => { }), 2000);
        }
    };

    // Fire and forget
    startStream().catch(() => { });

    return {
        stop: () => {
            stopped = true;
            try {
                stream?.removeAllListeners();
                (stream as any)?.destroy?.();
            } catch {
                // Ignore stream cleanup errors.
            }
            stream = null;
        },
    };
}
