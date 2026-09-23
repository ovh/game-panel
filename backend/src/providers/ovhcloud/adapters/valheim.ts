import type { GameServerRow } from '../../../types/gameServer.js';
import { normalizeMountsPayload } from '../../../utils/mounts.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import type { ProviderInstallContext } from '../../installTypes.js';
import {
    buildValheimProviderMetadata,
    getOvhcloudValheimImage,
    normalizeValheimEnv,
} from '../images/valheim.js';
import {
    VALHEIM_BACKUP_EXTENSIONS,
    VALHEIM_BACKUP_LOCATION,
    valheimBackupDirectory,
    restoreValheimBackup,
} from '../images/valheim/backups.js';
import { valheimConfigFiles } from '../images/valheim/configFiles.js';
import { valheimLaunchSettingsAccessor } from '../images/valheim/launchSettings.js';
import { resolveValheimSoftWipeTargets } from '../images/valheim/wipe.js';
import valheimRoutes from '../images/valheim/routes.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from './common.js';
import { valheimPlayersSupport } from '../images/valheim/onlinePlayers.js';
import type { OvhcloudImageAdapter, OvhcloudInstallResolution } from './types.js';

export const valheimAdapter: OvhcloudImageAdapter = {
    key: 'valheim',
    lifecycle: {
        stopTimeoutSeconds: OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS,
    },
    wipe: {
        soft: resolveValheimSoftWipeTargets,
        hard: true,
    },
    backup: {
        kind: 'directory',
        extensions: VALHEIM_BACKUP_EXTENSIONS,
        location: VALHEIM_BACKUP_LOCATION,
        directory: valheimBackupDirectory,
        createUnsupportedMessage:
            'Valheim manages its own world backups; on-demand backups are not supported because a '
            + 'backup only copies the state the game last flushed to disk, so it would duplicate the '
            + 'previous backup instead of capturing what happened since.',
        restore: restoreValheimBackup,
    },
    settings: {
        label: 'Valheim',
        launch: valheimLaunchSettingsAccessor,
        configFiles: valheimConfigFiles,
    },
    routes: [
        { path: '/valheim', router: valheimRoutes },
    ],

    players: valheimPlayersSupport,

    supportsImageId(imageId: string): boolean {
        return Boolean(getOvhcloudValheimImage(imageId));
    },

    supportsServer(server: GameServerRow): boolean {
        if (server.provider !== 'ovhcloud') return false;
        const metadata = getOvhcloudMetadata(server);
        return metadata.family === 'valheim' && metadata.serverType === 'valheim';
    },

    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution {
        const image = getOvhcloudValheimImage(imageId);
        if (!image) {
            throw Object.assign(new Error(`Unsupported Valheim imageId: ${imageId}`), { statusCode: 400 });
        }

        return {
            mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
            env: normalizeValheimEnv(ctx.body.env),
            providerMetadata: buildValheimProviderMetadata(image),
        };
    },

    validateEnv(_server: GameServerRow, env: string[]): string[] {
        return normalizeValheimEnv(env);
    },
};
