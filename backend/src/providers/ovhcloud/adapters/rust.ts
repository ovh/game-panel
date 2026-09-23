import type { GameServerRow } from '../../../types/gameServer.js';
import { normalizeMountsPayload } from '../../../utils/mounts.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import type { ProviderInstallContext } from '../../installTypes.js';
import {
    buildRustProviderMetadata,
    getOvhcloudRustImage,
    normalizeRustEnv,
} from '../images/rust.js';
import {
    createRustBackup,
    RUST_BACKUP_EXTENSIONS,
    restoreRustBackup,
} from '../images/rust/backups.js';
import rustRoutes from '../images/rust/routes.js';
import { rustConfigFiles } from '../images/rust/configFiles.js';
import { rustLaunchSettingsAccessor } from '../images/rust/launchSettings.js';
import { rustFileSettingsAccessor } from '../images/rust/settings.js';
import { resolveRustSoftWipeTargets } from '../images/rust/wipe.js';
import { PERMISSIONS } from '../../../permissions.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from './common.js';
import { rustPlayersSupport } from '../images/rust/onlinePlayers.js';
import type { OvhcloudImageAdapter, OvhcloudInstallResolution } from './types.js';

export const rustAdapter: OvhcloudImageAdapter = {
    key: 'rust',
    lifecycle: {
        stopTimeoutSeconds: OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS,
    },
    console: {
        script: '/app/send-command.sh',
        user: 'gameserver',
        workdir: '/app',
    },
    wipe: {
        soft: resolveRustSoftWipeTargets,
        hard: true,
    },
    backup: {
        extensions: RUST_BACKUP_EXTENSIONS,
        location: {
            root: 'backup',
            basePath: '/',
            containerPrefix: '/backups',
        },
        create: createRustBackup,
        restore: restoreRustBackup,
    },
    settings: {
        label: 'Rust',
        file: {
            permissions: {
                read: PERMISSIONS.rust.settings.read,
                write: PERMISSIONS.rust.settings.write,
            },
            accessor: rustFileSettingsAccessor,
        },
        launch: rustLaunchSettingsAccessor,
        configFiles: rustConfigFiles,
    },
    routes: [
        { path: '/rust', router: rustRoutes },
    ],

    players: rustPlayersSupport,

    supportsImageId(imageId: string): boolean {
        return Boolean(getOvhcloudRustImage(imageId));
    },

    supportsServer(server: GameServerRow): boolean {
        if (server.provider !== 'ovhcloud') return false;
        const metadata = getOvhcloudMetadata(server);
        return metadata.family === 'rust' && metadata.serverType === 'rust';
    },

    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution {
        const image = getOvhcloudRustImage(imageId);
        if (!image) {
            throw Object.assign(new Error(`Unsupported Rust imageId: ${imageId}`), { statusCode: 400 });
        }

        return {
            mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
            env: normalizeRustEnv(ctx.body.env),
            providerMetadata: buildRustProviderMetadata(image),
        };
    },

    validateEnv(_server: GameServerRow, env: string[]): string[] {
        return normalizeRustEnv(env);
    },
};
