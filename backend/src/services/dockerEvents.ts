import { docker } from '../utils/docker/client.js';
import { serverRepository } from '../database/index.js';
import type { ServerStatus } from '../types/gameServer.js';
import { inspectContainerRuntime } from '../utils/docker.js';
import {
    completeServerTransition,
    mapDockerHealthToServerStatus,
    shouldIgnoreDockerHealthStatus,
} from './serverTransitions.js';
import { afterOvhcloudServerStopped } from './ovhcloudLifecycle.js';
import { logError, logWarn, logInfo } from '../utils/logger.js';

type HealthStatus = 'healthy' | 'unhealthy' | 'starting';

async function applyDockerHealthStatus(serverId: number, containerId: string, health: HealthStatus): Promise<void> {
    const current = await serverRepository.findById(serverId);
    if (!current) return;

    const runtime = await inspectContainerRuntime(containerId).catch(() => ({
        containerStatus: 'running' as const,
        healthStatus: health,
    }));

    await serverRepository.updateRuntimeState(serverId, runtime);

    if (shouldIgnoreDockerHealthStatus(serverId, health)) {
        return;
    }

    const nextStatus = mapDockerHealthToServerStatus(current.status as ServerStatus, health);

    if (nextStatus === 'running' || nextStatus === 'unhealthy') {
        await completeServerTransition(serverId, nextStatus);
        return;
    }

    await serverRepository.updateStatusIfChanged(serverId, nextStatus);
}

async function applyDockerContainerState(serverId: number, containerId: string): Promise<void> {
    const current = await serverRepository.findById(serverId);
    if (!current) return;

    const runtime = await inspectContainerRuntime(containerId);
    const state = runtime.containerStatus;
    const health = runtime.healthStatus;

    await serverRepository.updateRuntimeState(serverId, runtime);

    if (state !== 'running') {
        await afterOvhcloudServerStopped(serverId, current).catch(() => undefined);
        await completeServerTransition(serverId, 'stopped');
        return;
    }

    if (health === 'none' || health === 'healthy') {
        await completeServerTransition(serverId, 'running');
        return;
    }

    if (health === 'starting') {
        if (shouldIgnoreDockerHealthStatus(serverId, health)) {
            return;
        }
        if (current.status === 'creating' || current.status === 'installing') {
            return;
        }
        await serverRepository.updateStatusIfChanged(serverId, 'starting');
        return;
    }

    await completeServerTransition(serverId, 'unhealthy');
}

function safeJsonParse(line: string): any | null {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
}


let periodicReconcileInFlight = false;

export function startPeriodicHealthReconcile(intervalMs = 20_000): { stop: () => void } {
    const handle = setInterval(() => {
        if (periodicReconcileInFlight) return;
        periodicReconcileInFlight = true;
        void reconcileDockerHealthToDb()
            .catch((e) => logError('SERVICE:DOCKER_EVENTS:PERIODIC_RECONCILE', e))
            .finally(() => { periodicReconcileInFlight = false; });
    }, intervalMs);

    return { stop: () => clearInterval(handle) };
}

// One-shot sync at boot: reads current container health and updates DB.
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
        if (labels['gamepanel.oneshot'] === 'true') continue;

        const serverIdStr = labels['gamepanel.serverId'];
        const serverId = serverIdStr ? Number(serverIdStr) : null;

        if (!serverId || !Number.isFinite(serverId)) continue;

        try {
            await applyDockerContainerState(serverId, containerId);
        } catch (e) {
            logError('SERVICE:DOCKER_EVENTS:RECONCILE', e, { containerId });
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

                    const action = evt.Action; // e.g. "health_status: healthy"
                    const attrs = evt.Actor?.Attributes ?? {};
                    if (attrs['gamepanel.oneshot'] === 'true') continue;

                    const serverIdStr = attrs['gamepanel.serverId'];
                    const serverIdNum = serverIdStr ? Number(serverIdStr) : NaN;

                    if (!Number.isFinite(serverIdNum) || serverIdNum <= 0) {
                        continue;
                    }

                    const serverId = serverIdNum;
                    const containerId = String(evt.Actor?.ID ?? evt.id ?? '');
                    if (!containerId) continue;

                    try {
                        if (action.startsWith('health_status:')) {
                            const health = action.split(':')[1]?.trim() as HealthStatus | undefined;
                            if (health) await applyDockerHealthStatus(serverId, containerId, health);
                            continue;
                        }

                        if (action === 'start' || action === 'die' || action === 'stop') {
                            await applyDockerContainerState(serverId, containerId);
                        }
                    } catch (e) {
                        logError('SERVICE:DOCKER_EVENTS:STATUS', e, { serverId, action });
                    }
                }
            });

            stream.on('end', () => {
                if (stopped) return;
                logWarn('SERVICE:DOCKER_EVENTS', 'Docker event stream ended; reconnecting');
                setTimeout(() => startStream().catch(() => { }), 1000);
            });

            stream.on('error', (err) => {
                if (stopped) return;
                logError('SERVICE:DOCKER_EVENTS:STREAM', err);
                setTimeout(() => startStream().catch(() => { }), 1000);
            });

            logInfo('SERVICE:DOCKER_EVENTS', 'Listening to Docker health_status events');
        } catch (err) {
            if (stopped) return;
            logError('SERVICE:DOCKER_EVENTS:OPEN', err);
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
