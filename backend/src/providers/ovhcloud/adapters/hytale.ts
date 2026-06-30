import type { GameServerRow } from '../../../types/gameServer.js';
import { normalizeMountsPayload } from '../../../utils/mounts.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import type { ProviderInstallContext } from '../../installTypes.js';
import {
    buildHytaleProviderMetadata,
    HYTALE_BACKUP_EXTENSIONS,
    getOvhcloudHytaleImage,
    normalizeHytaleEnv,
    normalizeHytalePatchline,
    normalizeOptionalHytaleProfileUuid,
} from '../images/hytale.js';
import { createHytaleBackup } from '../images/hytale/backups.js';
import {
    installOvhcloudHytaleServer,
    recreateHytaleContainer,
    restartHytaleServer,
    restoreOvhcloudHytaleBackup,
    startHytaleServer,
} from '../images/hytale/service.js';
import hytaleRoutes from '../images/hytale/routes.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from './common.js';
import type { OvhcloudImageAdapter, OvhcloudInstallResolution } from './types.js';

function getImageOptions(ctx: ProviderInstallContext): Record<string, unknown> {
    const raw = ctx.body.imageOptions;
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw Object.assign(new Error('imageOptions must be an object'), { statusCode: 400 });
    }
    return raw as Record<string, unknown>;
}

export const hytaleAdapter: OvhcloudImageAdapter = {
    key: 'hytale',
    installSteps: [
        { key: 'preparing_files', optional: false },
        { key: 'hytale_downloader_auth', optional: true },
        { key: 'downloading_server_files', optional: false },
        { key: 'extracting_server_files', optional: false },
        { key: 'hytale_account_auth', optional: false },
        { key: 'hytale_profile_selection', optional: true },
        { key: 'configuring_hytale_auth', optional: false },
        { key: 'pulling_image', optional: false },
        { key: 'creating_container', optional: false },
        { key: 'starting_container', optional: false },
    ],
    lifecycle: {
        restartPolicy: 'no',
        stopTimeoutSeconds: OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS,
        install: installOvhcloudHytaleServer,
        start: startHytaleServer,
        restart: restartHytaleServer,
        recreate: (_server, input) => recreateHytaleContainer(input),
    },
    console: {
        script: '/app/send-command.sh',
        user: 'gameserver',
        workdir: '/app',
    },
    routes: [
        { path: '/hytale', router: hytaleRoutes },
    ],

    supportsImageId(imageId: string): boolean {
        return Boolean(getOvhcloudHytaleImage(imageId));
    },

    supportsServer(server: GameServerRow): boolean {
        if (server.provider !== 'ovhcloud') return false;
        const metadata = getOvhcloudMetadata(server);
        return metadata.family === 'hytale' && metadata.serverType === 'hytale';
    },

    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution {
        const image = getOvhcloudHytaleImage(imageId);
        if (!image) {
            throw Object.assign(new Error(`Unsupported Hytale imageId: ${imageId}`), { statusCode: 400 });
        }

        const imageOptions = getImageOptions(ctx);
        const patchline = normalizeHytalePatchline(imageOptions.patchline);
        const profileUuid = normalizeOptionalHytaleProfileUuid(imageOptions.profileUuid);

        return {
            mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
            env: normalizeHytaleEnv(ctx.body.env),
            providerMetadata: buildHytaleProviderMetadata(image, patchline, profileUuid),
        };
    },

    validateEnv(_server: GameServerRow, env: string[]): string[] {
        return normalizeHytaleEnv(env);
    },

    backup: {
        extensions: HYTALE_BACKUP_EXTENSIONS,
        location: {
            root: 'data',
            basePath: '/game/Server/backups',
            containerPrefix: '/data',
        },
        create: createHytaleBackup,
        restore: (server, input) => restoreOvhcloudHytaleBackup(server, {
            containerArchivePath: `${input.location.containerPrefix}${input.resolvedApiPath}`,
        }),
    },
};
