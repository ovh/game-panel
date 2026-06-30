import type { GameServerRow } from '../../../types/gameServer.js';
import { normalizeMountsPayload } from '../../../utils/mounts.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import type { ProviderInstallContext } from '../../installTypes.js';
import {
    buildMinecraftProviderMetadata,
    getOvhcloudMinecraftImage,
    MINECRAFT_BACKUP_EXTENSIONS,
    normalizeMinecraftEnv,
} from '../images/minecraft.js';
import { createMinecraftBackup, restoreMinecraftBackup } from '../images/minecraft/backups.js';
import minecraftRoutes from '../images/minecraft/routes.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from './common.js';
import type { OvhcloudImageAdapter, OvhcloudInstallResolution } from './types.js';

export const minecraftAdapter: OvhcloudImageAdapter = {
    key: 'minecraft',
    lifecycle: {
        stopTimeoutSeconds: OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS,
    },
    console: {
        script: '/app/send-command.sh',
        user: 'gameserver',
        workdir: '/app',
    },
    routes: [
        { path: '/minecraft', router: minecraftRoutes },
    ],

    supportsImageId(imageId: string): boolean {
        return Boolean(getOvhcloudMinecraftImage(imageId));
    },

    supportsServer(server: GameServerRow): boolean {
        if (server.provider !== 'ovhcloud') return false;
        const metadata = getOvhcloudMetadata(server);
        return metadata.family === 'minecraft';
    },

    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution {
        const image = getOvhcloudMinecraftImage(imageId);
        if (!image) {
            throw Object.assign(new Error(`Unsupported Minecraft imageId: ${imageId}`), { statusCode: 400 });
        }

        return {
            mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
            env: normalizeMinecraftEnv(image, ctx.body.env),
            providerMetadata: buildMinecraftProviderMetadata(image),
        };
    },

    validateEnv(server: GameServerRow, env: string[]): string[] {
        const metadata = getOvhcloudMetadata(server);
        const image = getOvhcloudMinecraftImage(metadata.imageId);
        if (!image) return env;
        return normalizeMinecraftEnv(image, env);
    },

    backup: {
        extensions: MINECRAFT_BACKUP_EXTENSIONS,
        location: {
            root: 'backup',
            basePath: '/',
            containerPrefix: '/backups',
        },
        create: createMinecraftBackup,
        restore: restoreMinecraftBackup,
    },
};
