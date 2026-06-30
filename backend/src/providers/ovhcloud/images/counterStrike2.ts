import { normalizeEnvPayload } from '../../installPayload.js';

export const COUNTER_STRIKE_2_IMAGE_ID = 'counter-strike-2';

export type OvhcloudCounterStrike2Image = {
    imageId: typeof COUNTER_STRIKE_2_IMAGE_ID;
};

export function getOvhcloudCounterStrike2Image(imageId: string): OvhcloudCounterStrike2Image | null {
    return imageId === COUNTER_STRIKE_2_IMAGE_ID
        ? { imageId: COUNTER_STRIKE_2_IMAGE_ID }
        : null;
}

export function normalizeCounterStrike2Env(payload: unknown): string[] {
    return normalizeEnvPayload(payload);
}

export function buildCounterStrike2ProviderMetadata(
    image: OvhcloudCounterStrike2Image
): Record<string, unknown> {
    return {
        imageId: image.imageId,
        family: 'counter-strike',
        edition: '2',
        serverType: 'counter-strike-2',
        capabilities: {
            frameworks: {
                metamod: {
                    type: 'script',
                    script: '/app/install-metamod.sh',
                },
                counterStrikeSharp: {
                    type: 'script',
                    script: '/app/install-counterstrikesharp.sh',
                    requires: ['metamod'],
                },
                repair: {
                    type: 'script',
                    script: '/app/repair-cs2-frameworks.sh',
                },
            },
            consoleCommand: {
                type: 'script',
                script: '/app/send-command.sh',
            },
        },
    };
}
