import { promises as fs } from 'node:fs';
import { getOvhcloudPalworldMetadata } from '../../../serverMetadata.js';
import type { GameServerRow } from '../../../../types/gameServer.js';
import * as dockerUtils from '../../../../utils/docker.js';
import { ensureServerMountDirs } from '../../../../utils/storage.js';
import { resolveServerPath } from '../../../../services/fileExplorer.js';
import { getBasenameFromApiPath } from '../../../../utils/fsBrowser.js';
import { getRuntimeOwnership, parseStoredMounts } from '../../../runtimeConfig.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from '../../adapters/common.js';
import type {
    OvhcloudBackupCreateResult,
    OvhcloudBackupLocation,
    OvhcloudBackupRestoreInput,
    OvhcloudBackupRestoreResult,
} from '../../adapters/types.js';

const PALWORLD_SAVEGAMES_API_PATH = '/server/Pal/Saved/SaveGames/0';

export async function resolvePalworldBackupLocation(server: GameServerRow): Promise<OvhcloudBackupLocation> {
    let guid: string | null = null;
    try {
        const resolved = await resolveServerPath({
            serverId: server.id,
            root: 'data',
            path: PALWORLD_SAVEGAMES_API_PATH,
        });
        const entries = await fs.readdir(resolved.absPath, { withFileTypes: true });
        const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
        guid = dirs[0] ?? null;
    } catch {
        guid = null;
    }

    const basePath = guid
        ? `${PALWORLD_SAVEGAMES_API_PATH}/${guid}/backup/world`
        : `${PALWORLD_SAVEGAMES_API_PATH}/backup/world`;

    return { root: 'data', basePath, containerPrefix: '/data' };
}

export async function createPalworldBackup(
    server: GameServerRow & { docker_container_id: string },
    _options: Record<string, unknown> = {}
): Promise<OvhcloudBackupCreateResult> {
    getOvhcloudPalworldMetadata(server);

    const status = await dockerUtils.checkContainerStatus(server.docker_container_id);
    if (status !== 'running') {
        throw Object.assign(
            new Error('Palworld backups can only be created while the server is running'),
            { statusCode: 409 }
        );
    }

    const result = await dockerUtils.execInContainer(
        server.docker_container_id,
        ['/app/backup.sh'],
        { user: 'gameserver', workdir: '/app' }
    );

    return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        mode: 'hot',
    };
}

export async function restorePalworldBackup(
    server: GameServerRow & { docker_container_id: string },
    input: OvhcloudBackupRestoreInput
): Promise<OvhcloudBackupRestoreResult> {
    getOvhcloudPalworldMetadata(server);

    const status = await dockerUtils.checkContainerStatus(server.docker_container_id);
    if (status !== 'running' && status !== 'created' && status !== 'exited' && status !== 'dead') {
        throw Object.assign(new Error(`Cannot restore while container status is ${status}`), { statusCode: 409 });
    }

    const shouldRestart = status === 'running';
    if (shouldRestart) {
        await dockerUtils.stopContainer(server.docker_container_id, OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS);
    }

    const backupName = getBasenameFromApiPath(input.resolvedApiPath);
    const mounts = parseStoredMounts(server);
    const resolvedMounts = await ensureServerMountDirs(server.id, mounts, getRuntimeOwnership(server));

    const result = await dockerUtils.runOneShotContainer({
        image: server.docker_image_digest?.trim() || server.docker_image,
        namePrefix: `gamepanel-palworld-restore-${server.id}`,
        cmd: ['/app/restore.sh', backupName],
        mounts: resolvedMounts,
        user: 'gameserver',
        workdir: '/app',
        labels: {
            'gamepanel.serverId': String(server.id),
            'gamepanel.job': 'palworld-restore',
        },
    });

    const ok = result.exitCode === 0;
    let restarted = false;
    if (ok && shouldRestart) {
        await dockerUtils.startContainer(server.docker_container_id);
        restarted = true;
    }

    return {
        ok,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        restarted,
    };
}
