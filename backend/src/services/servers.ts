import type { NormalizedPortMappings } from '../utils/ports.js';
import { installProgressRepository, actionsRepository } from '../database/index.js';
import * as dockerUtils from '../utils/docker.js';
import { serverRepository } from '../database/index.js';
import { getGameAdapter } from '../games/registry.js';
import { bus } from '../realtime/bus.js';
import { provisionSftpForServer } from '../services/sftpProvision.js';
import type { NormalizedHealthcheck } from '../utils/docker/containers.js';
import type { GameServerRow } from '../types/gameServer.js';
import type { SteamCredentials } from '../games/types.js';
import { deleteSftpUser } from '../services/sftpAccounts.js';
import { regenerateSshdMatchFromDb } from '../routes/sftp.js';
import { ensureServerDataDirs, removeServerDataDir } from '../utils/storage.js';
import { logError } from '../utils/logger.js';
import { nowIso } from '../utils/time.js';
import { sendGameInstalledTelemetry, sendGameUninstalledTelemetry } from './telemetry.js';
import {
    beginServerTransition,
    clearServerTransition,
    INSTALL_TRANSITION_TIMEOUT_MS,
} from './serverTransitions.js';

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

export async function installServerAsync(
    serverId: number,
    gameKey: string,
    gameServerName: string,
    containerName: string,
    mappings: NormalizedPortMappings,
    opts: {
        image: string;
        healthcheck: NormalizedHealthcheck | null;
        steamCredentials: SteamCredentials | null;
    },
    username?: string
): Promise<void> {
    try {
        const adapter = getGameAdapter(gameKey);
        const storage = await ensureServerDataDirs(serverId);

        await adapter.preInstall({
            serverId,
            gameKey,
            gameServerName,
            dataDir: storage.dataDir,
            steamCredentials: opts.steamCredentials,
        });

        await installProgressRepository.update(serverId, 0, 'downloading');

        await dockerUtils.pullImageByName(opts.image);
        await installProgressRepository.update(serverId, 25, 'extracting');

        const containerInfo = await dockerUtils.createContainer(
            { gameKey, image: opts.image, healthcheck: opts.healthcheck },
            serverId,
            containerName,
            mappings
        );

        await installProgressRepository.update(serverId, 75, 'installing');

        await serverRepository.updateDockerInfo(serverId, containerInfo.id, containerInfo.name);
        await beginServerTransition(serverId, 'installing', {
            timeoutMs: INSTALL_TRANSITION_TIMEOUT_MS,
            timeoutBehavior: 'set_stopped',
            writeStatus: false,
            pollDockerHealth: true,
        });

        try {
            await provisionSftpForServer(serverId);
        } catch (err) {
            logError('SERVICE:SERVER_INSTALL:SFTP_PROVISION', err, { serverId });
        }

        await adapter.postInstall({ serverId, gameKey, containerId: containerInfo.id });

        await installProgressRepository.update(serverId, 100, 'completed');

        await actionsRepository.create(
            serverId,
            'success',
            `Server installed successfully. Container: ${containerInfo.name}`,
            username || ""
        );

        sendGameInstalledTelemetry({
            serverId,
            gameKey,
        });
    } catch (error) {
        logError('SERVICE:SERVER_INSTALL', error, { serverId, gameKey });
        clearServerTransition(serverId);
        await serverRepository.updateStatus(serverId, 'stopped');

        const message = error instanceof Error ? error.message : 'Unknown error';
        await installProgressRepository.update(serverId, 0, 'failed', message);
        await actionsRepository.create(serverId, 'error', `Installation failed: ${message}`, username || "");
    }
}

export async function deleteServerBestEffort(serverId: number): Promise<void> {
    const server = await serverRepository.findById(serverId);
    if (!server) {
        throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    }

    // Remove Docker container (best effort)
    if (server.docker_container_id) {
        try {
            await dockerUtils.removeContainer(server.docker_container_id);
        } catch (err) {
            logError('SERVICE:SERVER_DELETE:CONTAINER', err, { serverId });
        }
    }

    // Remove server data directory (best effort)
    try {
        await removeServerDataDir(serverId);
    } catch (err) {
        logError('SERVICE:SERVER_DELETE:DATA_DIR', err, { serverId });
    }

    // Remove SFTP user (best effort)
    const sftpUser = `gp_s${serverId}`;
    try {
        await deleteSftpUser(sftpUser);
    } catch (err) {
        logError('SERVICE:SERVER_DELETE:SFTP_USER', err, { serverId, sftpUser });
    }

    // Regenerate sshd match file (best effort)
    try {
        await regenerateSshdMatchFromDb();
    } catch (err) {
        logError('SERVICE:SERVER_DELETE:SSHD_REGEN', err, { serverId });
    }

    // Delete DB record (last)
    await serverRepository.delete(serverId);

    sendGameUninstalledTelemetry({
        serverId,
        gameKey: server.game_key,
    });

    bus.emit('server.deleted', { serverId, timestamp: nowIso() });
}
