import { getOvhcloudMinecraftMetadata } from '../../../serverMetadata.js';
import type { GameServerRow } from '../../../../types/gameServer.js';
import * as dockerUtils from '../../../../utils/docker.js';
import type { NormalizedMount } from '../../../../utils/mounts.js';
import { ensureServerMountDirs } from '../../../../utils/storage.js';
import type {
    OvhcloudBackupCreateResult,
    OvhcloudBackupRestoreInput,
    OvhcloudBackupRestoreResult,
} from '../../adapters/types.js';
import { getRuntimeOwnership, hasStoredMount, parseStoredMounts } from '../../../runtimeConfig.js';

function hasBackupsMount(mounts: NormalizedMount[]): boolean {
    return hasStoredMount(mounts, 'backup', '/backups');
}

function includeServerArtifactEnv(includeServerArtifact: boolean): string[] {
    return includeServerArtifact ? ['BACKUP_INCLUDE_SERVER_ARTIFACT=true'] : [];
}

function resolveServerImage(server: GameServerRow): string {
    return server.docker_image_digest?.trim() || server.docker_image;
}

export async function createMinecraftBackup(
    server: GameServerRow & { docker_container_id: string },
    options: Record<string, unknown> = {}
): Promise<OvhcloudBackupCreateResult> {
    getOvhcloudMinecraftMetadata(server);

    const mounts = parseStoredMounts(server);
    if (!hasBackupsMount(mounts)) {
        throw Object.assign(new Error('OVHcloud Minecraft backups require a backup -> /backups mount'), { statusCode: 409 });
    }

    const status = await dockerUtils.checkContainerStatus(server.docker_container_id);
    const env = includeServerArtifactEnv(Boolean(options.includeServerArtifact));

    if (status === 'running') {
        const result = await dockerUtils.execInContainer(
            server.docker_container_id,
            ['/app/backup.sh'],
            { user: 'gameserver', workdir: '/app', env }
        );

        return {
            ok: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            mode: 'hot',
        };
    }

    if (status !== 'created' && status !== 'exited' && status !== 'dead') {
        throw Object.assign(new Error(`Cannot run cold backup while container status is ${status}`), { statusCode: 409 });
    }

    const resolvedMounts = await ensureServerMountDirs(server.id, mounts, getRuntimeOwnership(server));
    const result = await dockerUtils.runOneShotContainer({
        image: resolveServerImage(server),
        namePrefix: `gamepanel-backup-${server.id}`,
        cmd: ['/app/backup.sh'],
        env,
        mounts: resolvedMounts,
        user: 'gameserver',
        workdir: '/app',
        labels: {
            'gamepanel.serverId': String(server.id),
            'gamepanel.job': 'backup',
        },
    });

    return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        mode: 'cold',
    };
}

export async function restoreMinecraftBackup(
    server: GameServerRow & { docker_container_id: string },
    input: OvhcloudBackupRestoreInput
): Promise<OvhcloudBackupRestoreResult> {
    getOvhcloudMinecraftMetadata(server);

    const mounts = parseStoredMounts(server);
    if (!hasBackupsMount(mounts)) {
        throw Object.assign(new Error('OVHcloud Minecraft restore requires a backup -> /backups mount'), { statusCode: 409 });
    }

    const status = await dockerUtils.checkContainerStatus(server.docker_container_id);
    if (status !== 'running' && status !== 'created' && status !== 'exited' && status !== 'dead') {
        throw Object.assign(new Error(`Cannot restore while container status is ${status}`), { statusCode: 409 });
    }

    const shouldRestart = status === 'running';
    if (shouldRestart) {
        await dockerUtils.stopContainer(server.docker_container_id);
    }

    const containerArchivePath = `/backups${input.apiPath.startsWith('/') ? input.apiPath : `/${input.apiPath}`}`;
    const resolvedMounts = await ensureServerMountDirs(server.id, mounts, getRuntimeOwnership(server));
    const result = await dockerUtils.runOneShotContainer({
        image: resolveServerImage(server),
        namePrefix: `gamepanel-restore-${server.id}`,
        cmd: ['/app/restore.sh', containerArchivePath],
        mounts: resolvedMounts,
        user: 'gameserver',
        workdir: '/app',
        labels: {
            'gamepanel.serverId': String(server.id),
            'gamepanel.job': 'restore',
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
