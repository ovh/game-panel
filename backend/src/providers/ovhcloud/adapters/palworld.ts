import type { GameServerRow } from '../../../types/gameServer.js';
import { normalizeMountsPayload } from '../../../utils/mounts.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import type { ProviderInstallContext } from '../../installTypes.js';
import {
    buildPalworldProviderMetadata,
    getOvhcloudPalworldImage,
    normalizePalworldEnv,
} from '../images/palworld.js';
import {
    createPalworldBackup,
    resolvePalworldBackupLocation,
    restorePalworldBackup,
} from '../images/palworld/backups.js';
import palworldRoutes from '../images/palworld/routes.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from './common.js';
import type { OvhcloudImageAdapter, OvhcloudInstallResolution } from './types.js';

export const palworldAdapter: OvhcloudImageAdapter = {
    key: 'palworld',
    lifecycle: {
        stopTimeoutSeconds: OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS,
    },
    console: {
        script: '/app/send-command.sh',
        user: 'gameserver',
        workdir: '/app',
    },
    backup: {
        kind: 'directory',
        extensions: [],
        location: {
            root: 'data',
            basePath: '/server/Pal/Saved/SaveGames/0',
            containerPrefix: '/data',
        },
        resolveLocation: resolvePalworldBackupLocation,
        create: createPalworldBackup,
        restore: restorePalworldBackup,
    },
    routes: [
        { path: '/palworld', router: palworldRoutes },
    ],

    supportsImageId(imageId: string): boolean {
        return Boolean(getOvhcloudPalworldImage(imageId));
    },

    supportsServer(server: GameServerRow): boolean {
        if (server.provider !== 'ovhcloud') return false;
        const metadata = getOvhcloudMetadata(server);
        return metadata.family === 'palworld' && metadata.serverType === 'palworld';
    },

    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution {
        const image = getOvhcloudPalworldImage(imageId);
        if (!image) {
            throw Object.assign(new Error(`Unsupported Palworld imageId: ${imageId}`), { statusCode: 400 });
        }

        return {
            mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
            env: normalizePalworldEnv(ctx.body.env),
            providerMetadata: buildPalworldProviderMetadata(image),
        };
    },

    validateEnv(_server: GameServerRow, env: string[]): string[] {
        return normalizePalworldEnv(env);
    },
};
