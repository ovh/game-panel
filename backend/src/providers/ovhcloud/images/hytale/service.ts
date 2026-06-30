import { promises as fs } from 'node:fs';
import { installProgressRepository, serverRepository, actionsRepository } from '../../../../database/index.js';
import type { ResolvedInstallSpec } from '../../../installTypes.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from '../../constants.js';
import { getOvhcloudHytaleMetadata } from '../../../serverMetadata.js';
import type { OvhcloudHytaleMetadata } from '../../../serverMetadata.js';
import type { GameServerRow, HealthStatus } from '../../../../types/gameServer.js';
import type { NormalizedHealthcheck } from '../../../../utils/healthcheck.js';
import type { NormalizedMount } from '../../../../utils/mounts.js';
import type { NormalizedPorts } from '../../../../utils/ports.js';
import type { NormalizedResourceLimits } from '../../../../utils/resourceLimits.js';
import { ensureServerDataDirs, ensureServerMountDirs } from '../../../../utils/storage.js';
import * as dockerUtils from '../../../../utils/docker.js';
import { logError } from '../../../../utils/logger.js';
import {
    getRuntimeOwnership,
    parseStoredEnv,
    parseStoredHealthcheck,
    parseStoredMounts,
    parseStoredPorts,
    parseStoredResourceLimits,
} from '../../../runtimeConfig.js';
import {
    beginServerTransition,
    clearServerTransition,
    completeServerTransition,
    INSTALL_TRANSITION_TIMEOUT_MS,
    POWER_TRANSITION_TIMEOUT_MS,
} from '../../../../services/serverTransitions.js';
import { sendGameInstalledTelemetry } from '../../../../services/telemetry.js';
import {
    assertServerExistsDuringInstall,
    serverExists,
    ServerInstallCancelledError,
} from '../../../../services/serverActionPolicy.js';
import { hytalePaths } from './paths.js';
import type { RestoreResult } from './types.js';
import { buildHytaleContainerEnv, prepareHytaleServerAuth } from './auth.js';
import { ensureDownloader, getAvailableHytaleVersion, prepareGameFiles } from './downloader.js';

async function completeInstallStatus(params: {
    serverId: number;
    healthcheckDefined: boolean;
}): Promise<void> {
    if (params.healthcheckDefined) {
        await beginServerTransition(params.serverId, 'installing', {
            timeoutMs: INSTALL_TRANSITION_TIMEOUT_MS,
            timeoutBehavior: 'reconcile',
            pollDockerHealth: true,
        });
        return;
    }

    await completeServerTransition(params.serverId, 'running');
}

async function completeStartStatus(params: {
    serverId: number;
    wasStarted: boolean;
    healthStatus: HealthStatus;
}): Promise<void> {
    if (!params.wasStarted) {
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

export async function installOvhcloudHytaleServer(params: {
    serverId: number;
    containerName: string;
    spec: ResolvedInstallSpec;
    username?: string;
}): Promise<void> {
    const metadata = params.spec.providerMetadata as OvhcloudHytaleMetadata;
    const paths = hytalePaths(params.serverId, metadata.patchline);

    await assertServerExistsDuringInstall(params.serverId);
    await installProgressRepository.update(params.serverId, 0, 'preparing_files');
    await ensureServerDataDirs(params.serverId);
    await fs.mkdir(paths.stateDir, { recursive: true, mode: 0o700 });

    const resolvedMounts = await ensureServerMountDirs(params.serverId, params.spec.mounts, {
        uid: params.spec.runtimeIdentity.uid,
        gid: params.spec.runtimeIdentity.gid,
    });
    await assertServerExistsDuringInstall(params.serverId);

    const downloaderPaths = await ensureDownloader(params.serverId, metadata.patchline);
    const version = await getAvailableHytaleVersion({
        serverId: params.serverId,
        paths: downloaderPaths,
        patchline: metadata.patchline,
    });
    await assertServerExistsDuringInstall(params.serverId);

    await prepareGameFiles({
        serverId: params.serverId,
        paths: downloaderPaths,
        patchline: metadata.patchline,
        version,
        ownership: {
            uid: params.spec.runtimeIdentity.uid,
            gid: params.spec.runtimeIdentity.gid,
        },
    });
    await assertServerExistsDuringInstall(params.serverId);

    await prepareHytaleServerAuth({
        serverId: params.serverId,
        metadata,
        ownership: {
            uid: params.spec.runtimeIdentity.uid,
            gid: params.spec.runtimeIdentity.gid,
        },
    });
    await assertServerExistsDuringInstall(params.serverId);

    const containerEnv = await buildHytaleContainerEnv({
        serverId: params.serverId,
        baseEnv: params.spec.env,
        metadata,
        version,
    });
    await assertServerExistsDuringInstall(params.serverId);

    await installProgressRepository.update(params.serverId, 70, 'pulling_image');
    await dockerUtils.pullImageByName(params.spec.dockerImage);
    await assertServerExistsDuringInstall(params.serverId);

    await installProgressRepository.update(params.serverId, 82, 'creating_container');
    const containerInfo = await dockerUtils.createContainer(
        {
            provider: params.spec.provider,
            catalogId: params.spec.catalogId,
            image: params.spec.dockerImage,
            env: containerEnv,
            mounts: resolvedMounts,
            ports: params.spec.ports,
            healthcheck: params.spec.healthcheck,
            resourceLimits: params.spec.resourceLimits,
            restartPolicy: 'no',
            start: false,
        },
        params.serverId,
        params.containerName
    );

    if (!(await serverExists(params.serverId))) {
        await dockerUtils.removeContainer(containerInfo.id).catch(() => undefined);
        throw new ServerInstallCancelledError(params.serverId);
    }

    await serverRepository.updateDockerInfo(params.serverId, containerInfo.id, containerInfo.name);
    await installProgressRepository.update(params.serverId, 90, 'starting_container');
    try {
        await dockerUtils.startContainer(containerInfo.id);
    } catch (error) {
        if (!(await serverExists(params.serverId))) {
            throw new ServerInstallCancelledError(params.serverId);
        }
        await dockerUtils.removeContainer(containerInfo.id).catch(() => undefined);
        await serverRepository.update(params.serverId, {
            docker_container_id: null,
            docker_container_name: null,
            container_status: 'missing',
            health_status: 'none',
        });
        throw error;
    }

    await assertServerExistsDuringInstall(params.serverId);
    const runtime = await dockerUtils.inspectContainerRuntime(containerInfo.id);
    await serverRepository.updateRuntimeState(params.serverId, runtime);
    await completeInstallStatus({
        serverId: params.serverId,
        healthcheckDefined: containerInfo.healthcheckDefined,
    });
    await installProgressRepository.update(params.serverId, 100, 'completed');

    await assertServerExistsDuringInstall(params.serverId);
    await actionsRepository.create(
        params.serverId,
        'success',
        `Hytale server installed successfully. Container: ${containerInfo.name}`,
        params.username || ''
    );

    await assertServerExistsDuringInstall(params.serverId);
    sendGameInstalledTelemetry({
        serverId: params.serverId,
        provider: params.spec.provider,
        catalogId: params.spec.catalogId,
        dockerImage: null,
    });
}

export async function recreateHytaleContainer(params: {
    serverId: number;
    start: boolean;
    containerName?: string;
    image?: string;
    env?: string[];
    mounts?: NormalizedMount[];
    ports?: NormalizedPorts;
    healthcheck?: NormalizedHealthcheck | null;
    resourceLimits?: NormalizedResourceLimits;
}): Promise<{ containerId: string; healthStatus: HealthStatus }> {
    const server = await serverRepository.findById(params.serverId);
    if (!server) throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    const metadata = getOvhcloudHytaleMetadata(server);

    const existingContainerId = server.docker_container_id;
    if (existingContainerId) {
        const status = await dockerUtils.checkContainerStatus(existingContainerId).catch(() => 'missing');
        if (status === 'running') {
            await dockerUtils.stopContainer(existingContainerId, OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS).catch((error) => {
                logError('HYTALE:STOP_BEFORE_RECREATE', error, { serverId: params.serverId });
            });
        }
        await dockerUtils.removeContainer(existingContainerId).catch((error) => {
            logError('HYTALE:REMOVE_CONTAINER', error, { serverId: params.serverId });
        });
    }

    const mounts = params.mounts ?? parseStoredMounts(server);
    const resolvedMounts = await ensureServerMountDirs(params.serverId, mounts, getRuntimeOwnership(server));
    const baseEnv = params.env ?? parseStoredEnv(server);
    const env = await buildHytaleContainerEnv({
        serverId: params.serverId,
        baseEnv,
        metadata,
    });

    const containerInfo = await dockerUtils.createContainer(
        {
            provider: server.provider,
            catalogId: server.catalog_id,
            image: params.image ?? server.docker_image_digest ?? server.docker_image,
            env,
            mounts: resolvedMounts,
            ports: params.ports ?? parseStoredPorts(server),
            healthcheck: params.healthcheck !== undefined ? params.healthcheck : parseStoredHealthcheck(server),
            resourceLimits: params.resourceLimits !== undefined ? params.resourceLimits : parseStoredResourceLimits(server),
            restartPolicy: 'no',
            start: params.start,
        },
        params.serverId,
        params.containerName
            ?? server.docker_container_name
            ?? dockerUtils.buildManagedContainerName(params.serverId, server.name)
    );

    await serverRepository.updateDockerInfo(params.serverId, containerInfo.id, containerInfo.name);
    const runtime = await dockerUtils.inspectContainerRuntime(containerInfo.id);
    await serverRepository.updateRuntimeState(params.serverId, runtime);

    return {
        containerId: containerInfo.id,
        healthStatus: runtime.healthStatus,
    };
}

export async function startHytaleServer(serverId: number): Promise<void> {
    const result = await recreateHytaleContainer({ serverId, start: true });
    await completeStartStatus({
        serverId,
        wasStarted: true,
        healthStatus: result.healthStatus,
    });
}

export async function restartHytaleServer(serverId: number): Promise<void> {
    const result = await recreateHytaleContainer({ serverId, start: true });
    await completeStartStatus({
        serverId,
        wasStarted: true,
        healthStatus: result.healthStatus,
    });
}

export async function restoreOvhcloudHytaleBackup(
    server: GameServerRow & { docker_container_id: string },
    params: { containerArchivePath: string }
): Promise<RestoreResult> {
    getOvhcloudHytaleMetadata(server);

    const status = await dockerUtils.checkContainerStatus(server.docker_container_id);
    if (status !== 'running' && status !== 'created' && status !== 'exited' && status !== 'dead') {
        throw Object.assign(new Error(`Cannot restore while container status is ${status}`), { statusCode: 409 });
    }

    const shouldRestart = status === 'running';
    if (shouldRestart) {
        await beginServerTransition(server.id, 'restarting', {
            timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
            timeoutBehavior: 'reconcile',
            pollDockerHealth: true,
        });
        await dockerUtils.stopContainer(server.docker_container_id, OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS);
    }

    const mounts = parseStoredMounts(server);
    const resolvedMounts = await ensureServerMountDirs(server.id, mounts, getRuntimeOwnership(server));
    const result = await dockerUtils.runOneShotContainer({
        image: server.docker_image_digest ?? server.docker_image,
        namePrefix: `gamepanel-hytale-restore-${server.id}`,
        cmd: ['/app/restore.sh', params.containerArchivePath],
        mounts: resolvedMounts,
        user: 'gameserver',
        workdir: '/app',
        labels: {
            'gamepanel.serverId': String(server.id),
            'gamepanel.job': 'hytale-restore',
        },
    });

    const ok = result.exitCode === 0;
    let restarted = false;

    if (ok && shouldRestart) {
        await startHytaleServer(server.id);
        restarted = true;
    } else if (!ok && shouldRestart) {
        clearServerTransition(server.id);
    }

    return {
        ok,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        restarted,
    };
}
