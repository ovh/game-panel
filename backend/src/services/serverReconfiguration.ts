import { serverRepository } from '../database/index.js';
import { getOvhcloudServerAdapter } from '../providers/ovhcloud/adapters/registry.js';
import type { NormalizedHealthcheck } from '../utils/healthcheck.js';
import type { NormalizedMount } from '../utils/mounts.js';
import type { NormalizedPorts } from '../utils/ports.js';
import type { NormalizedResourceLimits } from '../utils/resourceLimits.js';
import { ensureServerMountDirs, removeServerMountDir } from '../utils/storage.js';
import * as dockerUtils from '../utils/docker.js';
import type { GameServerRow, HealthStatus } from '../types/gameServer.js';
import {
    getRuntimeOwnership,
    parseStoredEnv,
    parseStoredHealthcheck,
    parseStoredMounts,
    parseStoredPorts,
    parseStoredResourceLimits,
} from '../providers/runtimeConfig.js';
import {
    beginServerTransition,
    clearServerTransition,
    completeServerTransition,
    POWER_TRANSITION_TIMEOUT_MS,
} from './serverTransitions.js';
import { getServerOrThrow } from './servers.js';
import {
    getServerRestartPolicy,
    getServerStopTimeoutSeconds,
    recreateOvhcloudServerIfHandled,
} from './ovhcloudLifecycle.js';
import {
    assertCanReconfigureContainer,
    assertCanReconfigureServer,
} from './serverActionPolicy.js';

type ReconfigureInput = {
    name?: string;
    ports?: NormalizedPorts;
    mounts?: NormalizedMount[];
    env?: string[];
    healthcheck?: NormalizedHealthcheck | null;
    hasHealthcheckPatch?: boolean;
    resourceLimits?: NormalizedResourceLimits;
    hasResourceLimitsPatch?: boolean;
    deleteHostData?: boolean;
};

export type ReconfigureResult = {
    reconfigured: boolean;
    wasRunning: boolean;
    usedImage: string;
    usedImageFallback: boolean;
    deletedHostDataKeys: string[];
    hostDataDeletionErrors: Array<{ key: string; error: string }>;
};

export type ResourceLimitsUpdateResult = {
    updated: boolean;
    dockerUpdated: boolean;
    containerStatus: string;
};

function validateEnvForServer(server: GameServerRow, env: string[]): string[] {
    if (server.provider !== 'ovhcloud') return env;
    return getOvhcloudServerAdapter(server).validateEnv?.(server, env) ?? env;
}

async function resolveImageForRecreate(server: GameServerRow): Promise<{
    image: string;
    usedFallback: boolean;
}> {
    const primary = server.docker_image_digest?.trim() || server.docker_image;
    if (await dockerUtils.imageExists(primary)) {
        return { image: primary, usedFallback: false };
    }

    try {
        await dockerUtils.pullImageByName(primary);
        return { image: primary, usedFallback: false };
    } catch (primaryError) {
        if (primary === server.docker_image) {
            throw primaryError;
        }
    }

    if (!(await dockerUtils.imageExists(server.docker_image))) {
        await dockerUtils.pullImageByName(server.docker_image);
    }

    return { image: server.docker_image, usedFallback: true };
}

async function deleteRemovedMountData(params: {
    serverId: number;
    oldMounts: NormalizedMount[];
    nextMounts: NormalizedMount[];
    enabled: boolean;
}): Promise<{
    deletedHostDataKeys: string[];
    hostDataDeletionErrors: Array<{ key: string; error: string }>;
}> {
    if (!params.enabled) {
        return { deletedHostDataKeys: [], hostDataDeletionErrors: [] };
    }

    const nextKeys = new Set(params.nextMounts.map((mount) => mount.key));
    const removedKeys = [...new Set(params.oldMounts.map((mount) => mount.key))]
        .filter((key) => !nextKeys.has(key));

    const deletedHostDataKeys: string[] = [];
    const hostDataDeletionErrors: Array<{ key: string; error: string }> = [];

    for (const key of removedKeys) {
        try {
            await removeServerMountDir(params.serverId, key);
            deletedHostDataKeys.push(key);
        } catch (error) {
            hostDataDeletionErrors.push({
                key,
                error: error instanceof Error ? error.message : 'Unknown deletion error',
            });
        }
    }

    return { deletedHostDataKeys, hostDataDeletionErrors };
}

async function completeReconfigureStatus(params: {
    serverId: number;
    wasRunning: boolean;
    healthStatus: HealthStatus;
}): Promise<void> {
    if (!params.wasRunning) {
        await completeServerTransition(params.serverId, 'stopped');
        return;
    }

    if (params.healthStatus === 'none' || params.healthStatus === 'healthy') {
        await completeServerTransition(params.serverId, 'running');
        return;
    }

    if (params.healthStatus === 'unhealthy' || params.healthStatus === 'unknown') {
        await completeServerTransition(params.serverId, 'unhealthy');
    }
}

export async function reconfigureServerContainer(
    serverId: number,
    input: ReconfigureInput
): Promise<ReconfigureResult> {
    const server = await getServerOrThrow(serverId);

    assertCanReconfigureServer(server);

    const currentContainerStatus = await dockerUtils.checkContainerStatus(server.docker_container_id);
    assertCanReconfigureContainer(currentContainerStatus);

    const currentPorts = parseStoredPorts(server);
    const currentMounts = parseStoredMounts(server);
    const currentEnv = parseStoredEnv(server);
    const currentHealthcheck = parseStoredHealthcheck(server);
    const currentResourceLimits = parseStoredResourceLimits(server);

    const nextPorts = input.ports ?? currentPorts;
    const nextMounts = input.mounts ?? currentMounts;
    const nextEnv = validateEnvForServer(server, input.env ?? currentEnv);
    const nextHealthcheck = input.hasHealthcheckPatch ? input.healthcheck ?? null : currentHealthcheck;
    const nextResourceLimits = input.hasResourceLimitsPatch ? input.resourceLimits ?? null : currentResourceLimits;

    const wasRunning = currentContainerStatus === 'running' || currentContainerStatus === 'restarting';
    const shouldStopBeforeReconfigure = currentContainerStatus === 'running';
    const displayName = input.name ?? server.name;
    const containerName = server.docker_container_name ?? dockerUtils.buildManagedContainerName(serverId, displayName);
    const resolvedMounts = await ensureServerMountDirs(serverId, nextMounts, getRuntimeOwnership(server));
    const image = await resolveImageForRecreate(server);

    if (wasRunning) {
        await beginServerTransition(serverId, 'restarting', {
            timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
            timeoutBehavior: 'reconcile',
            pollDockerHealth: true,
        });
    }

    try {
        if (shouldStopBeforeReconfigure) {
            await dockerUtils.stopContainer(
                server.docker_container_id,
                getServerStopTimeoutSeconds(server)
            );
        }

        const ovhcloudRecreate = await recreateOvhcloudServerIfHandled(server, {
            serverId,
            start: wasRunning,
            containerName,
            image: image.image,
            env: nextEnv,
            mounts: nextMounts,
            ports: nextPorts,
            healthcheck: nextHealthcheck,
            resourceLimits: nextResourceLimits,
        });

        if (ovhcloudRecreate.handled) {
            if (!ovhcloudRecreate.healthStatus) {
                throw new Error('OVHcloud recreate handler did not return health status');
            }

            await serverRepository.update(serverId, {
                name: displayName,
                ports_json: JSON.stringify(nextPorts),
                mounts_json: JSON.stringify(nextMounts),
                env_json: JSON.stringify(nextEnv),
                healthcheck_json: nextHealthcheck ? JSON.stringify(nextHealthcheck) : null,
                resource_limits_json: nextResourceLimits ? JSON.stringify(nextResourceLimits) : null,
                desired_state: wasRunning ? 'running' : 'stopped',
            });

            await completeReconfigureStatus({
                serverId,
                wasRunning,
                healthStatus: ovhcloudRecreate.healthStatus,
            });

            const deletion = await deleteRemovedMountData({
                serverId,
                oldMounts: currentMounts,
                nextMounts,
                enabled: Boolean(input.deleteHostData),
            });

            return {
                reconfigured: true,
                wasRunning,
                usedImage: image.image,
                usedImageFallback: image.usedFallback,
                ...deletion,
            };
        }

        await dockerUtils.removeContainer(server.docker_container_id);

        const containerInfo = await dockerUtils.createContainer(
            {
                provider: server.provider,
                catalogId: server.catalog_id,
                image: image.image,
                env: nextEnv,
                mounts: resolvedMounts,
                ports: nextPorts,
                healthcheck: nextHealthcheck,
                resourceLimits: nextResourceLimits,
                restartPolicy: getServerRestartPolicy(server),
                start: wasRunning,
            },
            serverId,
            containerName
        );

        await serverRepository.updateDockerInfo(serverId, containerInfo.id, containerInfo.name);
        await serverRepository.update(serverId, {
            name: displayName,
            ports_json: JSON.stringify(nextPorts),
            mounts_json: JSON.stringify(nextMounts),
            env_json: JSON.stringify(nextEnv),
            healthcheck_json: nextHealthcheck ? JSON.stringify(nextHealthcheck) : null,
            resource_limits_json: nextResourceLimits ? JSON.stringify(nextResourceLimits) : null,
            desired_state: wasRunning ? 'running' : 'stopped',
        });

        const runtime = await dockerUtils.inspectContainerRuntime(containerInfo.id);
        await serverRepository.updateRuntimeState(serverId, runtime);
        await completeReconfigureStatus({
            serverId,
            wasRunning,
            healthStatus: runtime.healthStatus,
        });

        const deletion = await deleteRemovedMountData({
            serverId,
            oldMounts: currentMounts,
            nextMounts,
            enabled: Boolean(input.deleteHostData),
        });

        return {
            reconfigured: true,
            wasRunning,
            usedImage: image.image,
            usedImageFallback: image.usedFallback,
            ...deletion,
        };
    } catch (error) {
        clearServerTransition(serverId);

        const message = error instanceof Error ? error.message : 'Unknown reconfiguration error';
        await serverRepository.markFailed(serverId, message).catch(() => undefined);
        throw error;
    }
}

export async function updateServerResourceLimits(
    serverId: number,
    resourceLimits: NormalizedResourceLimits
): Promise<ResourceLimitsUpdateResult> {
    const server = await serverRepository.findById(serverId);
    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    let dockerUpdated = false;
    let containerStatus = 'missing';

    if (server.docker_container_id) {
        containerStatus = await dockerUtils.checkContainerStatus(server.docker_container_id).catch(() => 'missing');

        if (containerStatus !== 'missing' && containerStatus !== 'removing') {
            await dockerUtils.updateContainerResourceLimits(server.docker_container_id, resourceLimits);
            dockerUpdated = true;
        }
    }

    await serverRepository.update(serverId, {
        resource_limits_json: resourceLimits ? JSON.stringify(resourceLimits) : null,
    });

    return {
        updated: true,
        dockerUpdated,
        containerStatus,
    };
}
