import type { GameServerRow } from '../../../types/gameServer.js';
import { normalizeMountsPayload } from '../../../utils/mounts.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import type { ProviderInstallContext } from '../../installTypes.js';
import {
    buildGarrysModProviderMetadata,
    getOvhcloudGarrysModImage,
    normalizeGarrysModEnv,
} from '../images/garrysMod.js';
import { garrysModConfigFiles } from '../images/garrysMod/configFiles.js';
import { garrysModLaunchSettingsAccessor } from '../images/garrysMod/launchSettings.js';
import { garrysModPlayersSupport } from '../images/garrysMod/onlinePlayers.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from './common.js';
import type { OvhcloudImageAdapter, OvhcloudInstallResolution } from './types.js';

export const garrysModAdapter: OvhcloudImageAdapter = {
    key: 'garrys-mod',
    lifecycle: {
        stopTimeoutSeconds: OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS,
    },
    console: {
        script: '/app/send-command.sh',
        user: 'gameserver',
        workdir: '/app',
    },
    wipe: {
        hard: true,
    },
    settings: {
        label: "Garry's Mod",
        launch: garrysModLaunchSettingsAccessor,
        configFiles: garrysModConfigFiles,
    },

    players: garrysModPlayersSupport,

    supportsImageId(imageId: string): boolean {
        return Boolean(getOvhcloudGarrysModImage(imageId));
    },

    supportsServer(server: GameServerRow): boolean {
        if (server.provider !== 'ovhcloud') return false;
        const metadata = getOvhcloudMetadata(server);
        return metadata.family === 'garrys-mod' && metadata.serverType === 'garrys-mod';
    },

    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution {
        const image = getOvhcloudGarrysModImage(imageId);
        if (!image) {
            throw Object.assign(new Error(`Unsupported Garry's Mod imageId: ${imageId}`), { statusCode: 400 });
        }

        return {
            mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
            env: normalizeGarrysModEnv(ctx.body.env),
            providerMetadata: buildGarrysModProviderMetadata(image),
        };
    },

    validateEnv(_server: GameServerRow, env: string[]): string[] {
        return normalizeGarrysModEnv(env);
    },
};
