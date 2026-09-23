import type { GameServerRow } from '../../../types/gameServer.js';
import { getOvhcloudGarrysModMetadata } from '../../serverMetadata.js';
import { normalizeEnvPayload } from '../../installPayload.js';

export const GARRYS_MOD_IMAGE_ID = 'garrys-mod';

export type OvhcloudGarrysModImage = {
    imageId: typeof GARRYS_MOD_IMAGE_ID;
};

export function getOvhcloudGarrysModImage(imageId: string): OvhcloudGarrysModImage | null {
    return imageId === GARRYS_MOD_IMAGE_ID
        ? { imageId: GARRYS_MOD_IMAGE_ID }
        : null;
}

export function normalizeGarrysModEnv(payload: unknown): string[] {
    return normalizeEnvPayload(payload);
}

export function buildGarrysModProviderMetadata(
    image: OvhcloudGarrysModImage
): Record<string, unknown> {
    return {
        imageId: image.imageId,
        family: 'garrys-mod',
        serverType: 'garrys-mod',
        capabilities: {
            consoleCommand: {
                type: 'script',
                script: '/app/send-command.sh',
            },
        },
    };
}

export function assertOvhcloudGarrysModServer(server: GameServerRow): void {
    getOvhcloudGarrysModMetadata(server);
}
