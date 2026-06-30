import { installProgressRepository, actionsRepository, installInteractionRepository } from '../database/index.js';
import * as dockerUtils from '../utils/docker.js';
import { serverRepository } from '../database/index.js';
import { getGameAdapter } from '../providers/linuxgsm/adapters/registry.js';
import { bus } from '../realtime/bus.js';
import type { GameServerRow } from '../types/gameServer.js';
import { ensureServerDataDirs, ensureServerMountDirs, removeServerDataDir } from '../utils/storage.js';
import { logError } from '../utils/logger.js';
import { nowIso } from '../utils/time.js';
import {
    beginServerTransition,
    clearServerTransition,
    completeServerTransition,
    INSTALL_TRANSITION_TIMEOUT_MS,
} from './serverTransitions.js';
import { sendGameInstalledTelemetry, sendGameUninstalledTelemetry } from './telemetry.js';
import type { ResolvedInstallSpec } from '../providers/installTypes.js';
import {
    beforeOvhcloudServerDelete,
    cleanupFailedOvhcloudInstallIfHandled,
    getOvhcloudInstallRestartPolicy,
    getServerStopTimeoutSeconds,
    installOvhcloudServerIfHandled,
} from './ovhcloudLifecycle.js';
import { removeLinuxGsmContainerCronsBestEffort } from './linuxGsmCrons.js';
import {
    assertCanDeleteServer,
    assertServerExistsDuringInstall,
    serverExists,
    ServerInstallCancelledError,
} from './serverActionPolicy.js';

type GameServerWithContainer = GameServerRow & {
    docker_container_id: string;
};

export async function getServerOrThrow(serverId: number): Promise<GameServerWithContainer> {
    const server = await serverRepository.findById(serverId);

    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    if (!server.docker_container_id) {
        throw Object.assign(new Error('Server has no container'), { statusCode: 400 });
    }

    return server as GameServerWithContainer;
}

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

export async function installServerAsync(
    serverId: number,
    displayName: string,
    spec: ResolvedInstallSpec,
    username?: string
): Promise<void> {
    try {
        await assertServerExistsDuringInstall(serverId);
        const containerName = dockerUtils.buildManagedContainerName(serverId, displayName);

        const handledInstall = await installOvhcloudServerIfHandled({
            serverId,
            containerName,
            spec,
            username,
        });
        if (handledInstall) {
            return;
        }

        await assertServerExistsDuringInstall(serverId);
        const storage = await ensureServerDataDirs(serverId);

        if (spec.provider === 'linuxgsm') {
            await assertServerExistsDuringInstall(serverId);
            const gameServerName = String(spec.providerMetadata.gameservername ?? '');
            const adapter = getGameAdapter(spec.catalogId ?? '');

            await adapter.beforeContainerCreate({
                serverId,
                shortname: spec.catalogId ?? '',
                gameServerName,
                dataDir: storage.dataDir,
                steamCredentials: spec.steamCredentials,
            });
        }

        await assertServerExistsDuringInstall(serverId);
        await installProgressRepository.update(serverId, 0, 'pulling_image');

        await dockerUtils.pullImageByName(spec.dockerImage);
        await assertServerExistsDuringInstall(serverId);
        await installProgressRepository.update(serverId, 25, 'preparing_files');

        const resolvedMounts = await ensureServerMountDirs(serverId, spec.mounts, {
            uid: spec.runtimeIdentity.uid,
            gid: spec.runtimeIdentity.gid,
        });
        await assertServerExistsDuringInstall(serverId);

        await installProgressRepository.update(serverId, 50, 'creating_container');
        const containerInfo = await dockerUtils.createContainer(
            {
                provider: spec.provider,
                catalogId: spec.catalogId,
                image: spec.dockerImage,
                env: spec.env,
                mounts: resolvedMounts,
                ports: spec.ports,
                healthcheck: spec.healthcheck,
                resourceLimits: spec.resourceLimits,
                restartPolicy: getOvhcloudInstallRestartPolicy(spec) ?? 'unless-stopped',
                start: false,
            },
            serverId,
            containerName
        );

        if (!(await serverExists(serverId))) {
            await dockerUtils.removeContainer(containerInfo.id).catch(() => undefined);
            throw new ServerInstallCancelledError(serverId);
        }

        await serverRepository.updateDockerInfo(serverId, containerInfo.id, containerInfo.name);
        await installProgressRepository.update(serverId, 75, 'starting_container');
        try {
            await dockerUtils.startContainer(containerInfo.id);
        } catch (error) {
            if (!(await serverExists(serverId))) {
                throw new ServerInstallCancelledError(serverId);
            }
            await dockerUtils.removeContainer(containerInfo.id).catch(() => undefined);
            await serverRepository.update(serverId, {
                docker_container_id: null,
                docker_container_name: null,
                container_status: 'missing',
                health_status: 'none',
            });
            throw error;
        }

        await assertServerExistsDuringInstall(serverId);
        const runtime = await dockerUtils.inspectContainerRuntime(containerInfo.id);
        await serverRepository.updateRuntimeState(serverId, runtime);
        if (spec.provider === 'linuxgsm') {
            const freshServer = await serverRepository.findById(serverId);
            if (freshServer) await removeLinuxGsmContainerCronsBestEffort(freshServer);
        }
        await completeInstallStatus({
            serverId,
            healthcheckDefined: containerInfo.healthcheckDefined,
        });

        if (spec.provider === 'linuxgsm') {
            await assertServerExistsDuringInstall(serverId);
            const adapter = getGameAdapter(spec.catalogId ?? '');
            await adapter.afterContainerStart({
                serverId,
                shortname: spec.catalogId ?? '',
                containerId: containerInfo.id,
            });
        }

        await assertServerExistsDuringInstall(serverId);
        await installProgressRepository.update(serverId, 100, 'completed');

        await actionsRepository.create(
            serverId,
            'success',
            `Server installed successfully. Container: ${containerInfo.name}`,
            username || ""
        );

        await assertServerExistsDuringInstall(serverId);
        sendGameInstalledTelemetry({
            serverId,
            provider: spec.provider,
            catalogId: spec.catalogId,
            dockerImage: spec.provider === 'external' ? spec.dockerImage : null,
        });
    } catch (error) {
        if (error instanceof ServerInstallCancelledError || !(await serverExists(serverId))) {
            clearServerTransition(serverId);
            await installInteractionRepository.cancelActiveForServer(serverId).catch(() => undefined);
            await dockerUtils.removeManagedContainersForServer(serverId).catch(() => undefined);
            await removeServerDataDir(serverId).catch(() => undefined);
            return;
        }

        logError('SERVICE:SERVER_INSTALL', error, { serverId, provider: spec.provider, catalogId: spec.catalogId });
        clearServerTransition(serverId);
        await cleanupFailedOvhcloudInstallIfHandled(serverId, spec);
        await installInteractionRepository.cancelActiveForServer(serverId).catch(() => undefined);

        const message = error instanceof Error ? error.message : 'Unknown error';
        await serverRepository.markFailed(serverId, message);
        await installProgressRepository.update(serverId, 0, 'failed', message);
        await actionsRepository.create(serverId, 'error', `Installation failed: ${message}`, username || "");
    }
}

export async function deleteServerBestEffort(serverId: number): Promise<void> {
    const server = await serverRepository.findById(serverId);
    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    assertCanDeleteServer(server);

    if (server.docker_container_id) {
        if (server.provider === 'ovhcloud') {
            const status = await dockerUtils.checkContainerStatus(server.docker_container_id).catch(() => 'missing');
            if (status === 'running') {
                await dockerUtils.stopContainer(server.docker_container_id, getServerStopTimeoutSeconds(server)).catch((err) => {
                    logError('SERVICE:SERVER_DELETE:STOP', err, { serverId });
                });
            }
            await beforeOvhcloudServerDelete(serverId, server);
        }

        try {
            await dockerUtils.removeContainer(server.docker_container_id);
        } catch (err) {
            logError('SERVICE:SERVER_DELETE:CONTAINER', err, { serverId });
        }
    }

    try {
        await dockerUtils.removeManagedContainersForServer(serverId);
    } catch (err) {
        logError('SERVICE:SERVER_DELETE:MANAGED_CONTAINERS', err, { serverId });
    }

    try {
        await removeServerDataDir(serverId);
    } catch (err) {
        logError('SERVICE:SERVER_DELETE:DATA_DIR', err, { serverId });
    }

    await serverRepository.delete(serverId);

    sendGameUninstalledTelemetry({
        serverId,
        provider: server.provider,
        catalogId: server.catalog_id,
        dockerImage: server.provider === 'external' ? server.docker_image : null,
    });

    bus.emit('server.deleted', { serverId, timestamp: nowIso() });
}
