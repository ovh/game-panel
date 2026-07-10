import { serverRepository } from '../database/index.js';
import type { ContainerStatus, HealthStatus, ServerStatus } from '../types/gameServer.js';
import type { ContainerHealthStatus, ContainerRuntimeState } from '../utils/docker/containers.js';
import { inspectContainerRuntime } from '../utils/docker.js';
import { logError } from '../utils/logger.js';

type TransitionStatus = Extract<
    ServerStatus,
    'installing' | 'starting' | 'stopping' | 'restarting'
>;

type TransitionTimeoutBehavior = 'reconcile';

interface ActiveServerTransition {
    status: TransitionStatus;
    timeoutAt: number;
    timeoutBehavior: TransitionTimeoutBehavior;
    timeoutHandle: NodeJS.Timeout;
    healthPollStartHandle: NodeJS.Timeout | null;
    healthPollHandle: NodeJS.Timeout | null;
}

const HEALTH_POLL_INTERVAL_MS = 5_000;

export const INSTALL_TRANSITION_TIMEOUT_MS = 60 * 60_000;
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

    if (transition.status === 'stopping') {
        return;
    }

    const runtime = await inspectServerRuntime(serverId);
    if (!runtime) {
        return;
    }

    if (runtime.containerStatus !== 'running') {
        await completeServerTransition(serverId, 'stopped');
        return;
    }

    if (runtime.healthStatus === 'healthy' || runtime.healthStatus === 'none') {
        await completeServerTransition(serverId, 'running');
        return;
    }

    if (runtime.healthStatus === 'unhealthy') {
        await completeServerTransition(serverId, 'unhealthy');
        return;
    }
}

async function handleTransitionTimeout(serverId: number): Promise<void> {
    const transition = activeTransitions.get(serverId);
    if (!transition) return;

    const timedOutStatus = transition.status;
    clearTransitionHandles(serverId);

    try {
        if (timedOutStatus === 'installing') {
            const runtime = await inspectServerRuntime(serverId);
            if (
                runtime &&
                runtime.containerStatus === 'running' &&
                runtime.healthStatus !== 'healthy' &&
                runtime.healthStatus !== 'none'
            ) {
                await completeServerTransition(serverId, 'unhealthy');
                return;
            }
        }

        await reconcileServerStatus(serverId);
    } catch (error) {
        logError('SERVICE:SERVER_TRANSITION:TIMEOUT', error, {
            serverId,
            status: timedOutStatus,
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

    if (opts.writeStatus !== false) {
        await serverRepository.updateStatus(serverId, status);
    }

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
    finalStatus: Extract<ServerStatus, 'running' | 'stopped' | 'unhealthy'>
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

    return healthStatus === 'starting';
}

export function mapDockerHealthToServerStatus(
    _currentStatus: ServerStatus,
    healthStatus: ContainerHealthStatus
): ServerStatus {
    if (healthStatus === 'healthy') {
        return 'running';
    }

    if (healthStatus === 'starting') {
        return 'starting';
    }

    return 'unhealthy';
}

function mapRuntimeToServerStatus(params: {
    currentStatus: ServerStatus;
    containerStatus: ContainerStatus;
    healthStatus: HealthStatus;
    activeTransitionStatus: TransitionStatus | null;
}): ServerStatus {
    if (params.containerStatus !== 'running') {
        return 'stopped';
    }

    if (params.healthStatus === 'healthy' || params.healthStatus === 'none') {
        return 'running';
    }

    if (params.healthStatus === 'starting') {
        if (params.activeTransitionStatus && params.currentStatus === params.activeTransitionStatus) {
            return params.currentStatus;
        }
        return 'starting';
    }

    return 'unhealthy';
}

export async function reconcileServerStatus(serverId: number): Promise<ServerStatus | null> {
    const activeTransitionStatus = activeTransitions.get(serverId)?.status ?? null;
    clearTransitionHandles(serverId);

    const server = await serverRepository.findById(serverId);
    if (!server) return null;

    const runtime = await inspectServerRuntime(serverId);

    if (!runtime) {
        const nextStatus: ServerStatus = 'stopped';
        await serverRepository.updateRuntimeAndStatusIfChanged(serverId, {
            status: nextStatus,
            containerStatus: 'missing',
            healthStatus: 'none',
        });
        return nextStatus;
    }

    const nextStatus = mapRuntimeToServerStatus({
        currentStatus: server.status,
        containerStatus: runtime.containerStatus,
        healthStatus: runtime.healthStatus,
        activeTransitionStatus,
    });

    await serverRepository.updateRuntimeAndStatusIfChanged(serverId, {
        status: nextStatus,
        containerStatus: runtime.containerStatus,
        healthStatus: runtime.healthStatus,
    });
    return nextStatus;
}
