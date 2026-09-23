import type { GameServerRow } from '../../../types/gameServer.js';
import { normalizeMountsPayload } from '../../../utils/mounts.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import type { ProviderInstallContext } from '../../installTypes.js';
import {
    buildProjectZomboidProviderMetadata,
    getOvhcloudProjectZomboidImage,
    normalizeProjectZomboidEnv,
} from '../images/projectZomboid.js';
import {
    createProjectZomboidBackup,
    PROJECT_ZOMBOID_BACKUP_EXTENSIONS,
    restoreProjectZomboidBackup,
} from '../images/projectZomboid/backups.js';
import projectZomboidRoutes from '../images/projectZomboid/routes.js';
import { projectZomboidConfigFiles } from '../images/projectZomboid/configFiles.js';
import { projectZomboidLaunchSettingsAccessor } from '../images/projectZomboid/launchSettings.js';
import { projectZomboidFileSettingsAccessor } from '../images/projectZomboid/settings.js';
import { resolveProjectZomboidSoftWipeTargets } from '../images/projectZomboid/wipe.js';
import { PERMISSIONS } from '../../../permissions.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from './common.js';
import { projectZomboidPlayersSupport } from '../images/projectZomboid/onlinePlayers.js';
import type { OvhcloudImageAdapter, OvhcloudInstallResolution } from './types.js';

export const projectZomboidAdapter: OvhcloudImageAdapter = {
    key: 'project-zomboid',
    lifecycle: {
        stopTimeoutSeconds: OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS,
    },
    console: {
        script: '/app/send-command.sh',
        user: 'gameserver',
        workdir: '/app',
    },
    wipe: {
        soft: resolveProjectZomboidSoftWipeTargets,
        hard: true,
    },
    backup: {
        extensions: PROJECT_ZOMBOID_BACKUP_EXTENSIONS,
        location: {
            root: 'backup',
            basePath: '/',
            containerPrefix: '/backups',
        },
        create: createProjectZomboidBackup,
        restore: restoreProjectZomboidBackup,
    },
    settings: {
        label: 'Project Zomboid',
        file: {
            permissions: {
                read: PERMISSIONS.projectZomboid.settings.read,
                write: PERMISSIONS.projectZomboid.settings.write,
            },
            accessor: projectZomboidFileSettingsAccessor,
        },
        launch: projectZomboidLaunchSettingsAccessor,
        configFiles: projectZomboidConfigFiles,
    },
    routes: [
        { path: '/project-zomboid', router: projectZomboidRoutes },
    ],

    players: projectZomboidPlayersSupport,

    supportsImageId(imageId: string): boolean {
        return Boolean(getOvhcloudProjectZomboidImage(imageId));
    },

    supportsServer(server: GameServerRow): boolean {
        if (server.provider !== 'ovhcloud') return false;
        const metadata = getOvhcloudMetadata(server);
        return metadata.family === 'project-zomboid' && metadata.serverType === 'project-zomboid';
    },

    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution {
        const image = getOvhcloudProjectZomboidImage(imageId);
        if (!image) {
            throw Object.assign(new Error(`Unsupported Project Zomboid imageId: ${imageId}`), { statusCode: 400 });
        }

        return {
            mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
            env: normalizeProjectZomboidEnv(ctx.body.env),
            providerMetadata: buildProjectZomboidProviderMetadata(image),
        };
    },

    validateEnv(_server: GameServerRow, env: string[]): string[] {
        return normalizeProjectZomboidEnv(env);
    },
};
