import { serverRepository } from '../database/index.js';
import type { ServerStatus } from '../types/gameServer.js';
import type { ContainerHealthStatus, ContainerRuntimeState } from '../utils/docker/containers.js';
import { inspectContainerRuntime } from '../utils/docker.js';
import { logError } from '../utils/logger.js';

type TransitionStatus = Extract<
    ServerStatus,
    'installing' | 'starting' | 'stopping' | 'restarting'
>;

type TransitionTimeoutBehavior = 'reconcile' | 'set_stopped';

interface ActiveServerTransition {
    status: TransitionStatus;
    timeoutAt: number;
    timeoutBehavior: TransitionTimeoutBehavior;
    timeoutHandle: NodeJS.Timeout;
    healthPollStartHandle: NodeJS.Timeout | null;
    healthPollHandle: NodeJS.Timeout | null;
}

const HEALTH_POLL_INTERVAL_MS = 5_000;

export const INSTALL_TRANSITION_TIMEOUT_MS = 8 * 60_000;
export const POWER_TRANSITION_TIMEOUT_MS = 3 * 60_000;
export const RESTART_HEALTH_POLL_DELAY_MS = 15_000;

const activeTransitions = new Map<number, ActiveServerTransition>();

function clearTransitionHandles(serverId: number): void {
    const current = activeTransitions.get(serverId);
    if (!current) return;

    clearTimeout(current.timeoutHandle);
    if (current.healthPollStartHandle) {
        clearTimeout(current.healthPollStartHandle);
    }
    if (current.healthPollHandle) {
        clearInterval(current.healthPollHandle);
    }
    activeTransitions.delete(serverId);
}

async function inspectServerRuntime(serverId: number): Promise<ContainerRuntimeState | null> {
    const server = await serverRepository.findById(serverId);
    if (!server?.docker_container_id) {
        return null;
    }

    try {
        return await inspectContainerRuntime(server.docker_container_id);
    } catch {
        return null;
    }
}

async function monitorTransitionHealth(serverId: number, expectedStatus: TransitionStatus): Promise<void> {
    const transition = activeTransitions.get(serverId);
    if (!transition || transition.status !== expectedStatus) {
        return;
    }

    const runtime = await inspectServerRuntime(serverId);
    if (runtime?.healthStatus !== 'healthy') {
        return;
    }

    await completeServerTransition(serverId, 'running');
}

async function handleTransitionTimeout(serverId: number): Promise<void> {
    const transition = activeTransitions.get(serverId);
    if (!transition) return;

    clearTransitionHandles(serverId);

    try {
        if (transition.timeoutBehavior === 'set_stopped') {
            await serverRepository.updateStatusIfChanged(serverId, 'stopped');
            return;
        }

        await reconcileServerStatus(serverId);
    } catch (error) {
        logError('SERVICE:SERVER_TRANSITION:TIMEOUT', error, {
            serverId,
            status: transition.status,
        });
    }
}

function startTransitionHealthPolling(serverId: number, status: TransitionStatus): NodeJS.Timeout {
    const healthPollHandle = setInterval(() => {
        void monitorTransitionHealth(serverId, status);
    }, HEALTH_POLL_INTERVAL_MS);

    void monitorTransitionHealth(serverId, status).catch((error) => {
        logError('SERVICE:SERVER_TRANSITION:INITIAL_HEALTH_POLL', error, {
            serverId,
            status,
        });
    });

    return healthPollHandle;
}

export async function beginServerTransition(
    serverId: number,
    status: TransitionStatus,
    opts: {
        timeoutMs: number;
        timeoutBehavior: TransitionTimeoutBehavior;
        writeStatus?: boolean;
        pollDockerHealth?: boolean;
        healthPollDelayMs?: number;
    }
): Promise<void> {
    clearTransitionHandles(serverId);

    if (opts.writeStatus !== false) {
        await serverRepository.updateStatus(serverId, status);
    }

    const timeoutHandle = setTimeout(() => {
        void handleTransitionTimeout(serverId);
    }, opts.timeoutMs);

    activeTransitions.set(serverId, {
        status,
        timeoutAt: Date.now() + opts.timeoutMs,
        timeoutBehavior: opts.timeoutBehavior,
        timeoutHandle,
        healthPollStartHandle: null,
        healthPollHandle: null,
    });

    let healthPollStartHandle: NodeJS.Timeout | null = null;
    let healthPollHandle: NodeJS.Timeout | null = null;
    if (opts.pollDockerHealth) {
        const healthPollDelayMs = Math.max(0, opts.healthPollDelayMs ?? 0);

        if (healthPollDelayMs > 0) {
            healthPollStartHandle = setTimeout(() => {
                const current = activeTransitions.get(serverId);
                if (!current || current.status !== status) {
                    return;
                }

                current.healthPollStartHandle = null;
                current.healthPollHandle = startTransitionHealthPolling(serverId, status);
            }, healthPollDelayMs);
        } else {
            healthPollHandle = startTransitionHealthPolling(serverId, status);
        }
    }

    const current = activeTransitions.get(serverId);
    if (!current) return;
    current.healthPollStartHandle = healthPollStartHandle;
    current.healthPollHandle = healthPollHandle;
}

export function clearServerTransition(serverId: number): void {
    clearTransitionHandles(serverId);
}

export async function completeServerTransition(
    serverId: number,
    finalStatus: Extract<ServerStatus, 'running' | 'stopped'>
): Promise<void> {
    clearTransitionHandles(serverId);
    await serverRepository.updateStatusIfChanged(serverId, finalStatus);
}

export function shouldIgnoreDockerHealthStatus(
    serverId: number,
    healthStatus: ContainerHealthStatus
): boolean {
    const transition = activeTransitions.get(serverId);
    if (!transition) return false;

    if (Date.now() >= transition.timeoutAt) {
        clearTransitionHandles(serverId);
        return false;
    }

    if (transition.status === 'stopping') {
        return true;
    }

    return healthStatus !== 'healthy';
}

export function mapDockerHealthToServerStatus(
    currentStatus: ServerStatus,
    healthStatus: ContainerHealthStatus
): ServerStatus {
    if (healthStatus === 'healthy') {
        return 'running';
    }

    if (
        healthStatus === 'starting' &&
        (currentStatus === 'installing' || currentStatus === 'starting' || currentStatus === 'restarting')
    ) {
        return currentStatus;
    }

    return 'stopped';
}

export async function reconcileServerStatus(serverId: number): Promise<ServerStatus | null> {
    clearTransitionHandles(serverId);

    const server = await serverRepository.findById(serverId);
    if (!server) return null;

    const runtime = await inspectServerRuntime(serverId);

    let nextStatus: ServerStatus = 'stopped';

    if (runtime?.containerStatus === 'running') {
        if (runtime.healthStatus === 'healthy') {
            nextStatus = 'running';
        } else if (
            runtime.healthStatus === 'starting' &&
            (server.status === 'installing' || server.status === 'starting' || server.status === 'restarting')
        ) {
            nextStatus = server.status;
        } else if (runtime.healthStatus === null) {
            nextStatus =
                server.status === 'running' || server.status === 'stopping'
                    ? 'running'
                    : 'stopped';
        } else {
            nextStatus = 'stopped';
        }
    }

    await serverRepository.updateStatusIfChanged(serverId, nextStatus);
    return nextStatus;
}
