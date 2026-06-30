import type { GameServerRow } from '../../../types/gameServer.js';
import { normalizeMountsPayload } from '../../../utils/mounts.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import type { ProviderInstallContext } from '../../installTypes.js';
import {
    buildCounterStrike2ProviderMetadata,
    getOvhcloudCounterStrike2Image,
    normalizeCounterStrike2Env,
} from '../images/counterStrike2.js';
import { OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS } from './common.js';
import type { OvhcloudImageAdapter, OvhcloudInstallResolution } from './types.js';
import counterStrike2Routes from '../images/counterStrike2/routes.js';

export const counterStrike2Adapter: OvhcloudImageAdapter = {
    key: 'counter-strike-2',
    lifecycle: {
        stopTimeoutSeconds: OVHCLOUD_DOCKER_STOP_TIMEOUT_SECONDS,
    },
    console: {
        script: '/app/send-command.sh',
        user: 'gameserver',
        workdir: '/app',
    },
    routes: [
        { path: '/counter-strike-2', router: counterStrike2Routes },
    ],

    supportsImageId(imageId: string): boolean {
        return Boolean(getOvhcloudCounterStrike2Image(imageId));
    },

    supportsServer(server: GameServerRow): boolean {
        if (server.provider !== 'ovhcloud') return false;
        const metadata = getOvhcloudMetadata(server);
        return metadata.family === 'counter-strike' && metadata.serverType === 'counter-strike-2';
    },

    resolveInstall(ctx: ProviderInstallContext, imageId: string): OvhcloudInstallResolution {
        const image = getOvhcloudCounterStrike2Image(imageId);
        if (!image) {
            throw Object.assign(new Error(`Unsupported Counter-Strike 2 imageId: ${imageId}`), { statusCode: 400 });
        }

        return {
            mounts: normalizeMountsPayload(ctx.body.mounts) ?? [],
            env: normalizeCounterStrike2Env(ctx.body.env),
            providerMetadata: buildCounterStrike2ProviderMetadata(image),
        };
    },

    validateEnv(_server: GameServerRow, env: string[]): string[] {
        return normalizeCounterStrike2Env(env);
    },

};
