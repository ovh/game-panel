import { randomBytes } from 'node:crypto';
import type { GameServerRow } from '../../../types/gameServer.js';
import { getOvhcloudPalworldMetadata } from '../../serverMetadata.js';
import { normalizeEnvPayload } from '../../installPayload.js';

export const PALWORLD_IMAGE_ID = 'palworld';

export type OvhcloudPalworldImage = {
    imageId: typeof PALWORLD_IMAGE_ID;
};

export function getOvhcloudPalworldImage(imageId: string): OvhcloudPalworldImage | null {
    return imageId === PALWORLD_IMAGE_ID
        ? { imageId: PALWORLD_IMAGE_ID }
        : null;
}

function generatePalworldAdminPassword(): string {
    return randomBytes(32).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}

export function normalizePalworldEnv(payload: unknown): string[] {
    const env = normalizeEnvPayload(payload);

    if (!env.some((entry) => /^PALWORLD_ADMIN_PASSWORD=.+/.test(entry))) {
        const withoutEmpty = env.filter((entry) => !entry.startsWith('PALWORLD_ADMIN_PASSWORD='));
        withoutEmpty.push(`PALWORLD_ADMIN_PASSWORD=${generatePalworldAdminPassword()}`);
        return withoutEmpty;
    }

    return env;
}

export function buildPalworldProviderMetadata(
    image: OvhcloudPalworldImage
): Record<string, unknown> {
    return {
        imageId: image.imageId,
        family: 'palworld',
        serverType: 'palworld',
        capabilities: {
            backup: {
                type: 'native-folder',
                script: '/app/backup.sh',
            },
            restore: {
                type: 'script',
                script: '/app/restore.sh',
            },
            consoleCommand: {
                type: 'script',
                script: '/app/send-command.sh',
            },
        },
    };
}

export function assertOvhcloudPalworldServer(server: GameServerRow): void {
    getOvhcloudPalworldMetadata(server);
}
