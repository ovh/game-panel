import { normalizeEnvPayload } from '../../installPayload.js';

export const HYTALE_IMAGE_ID = 'hytale';
export const HYTALE_BACKUP_EXTENSIONS = ['.zip'];
export const HYTALE_PATCHLINES = ['release', 'pre-release'] as const;

export type HytalePatchline = typeof HYTALE_PATCHLINES[number];

export type OvhcloudHytaleImage = {
    imageId: typeof HYTALE_IMAGE_ID;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESERVED_ENV_KEYS = new Set([
    'HYTALE_SERVER_SESSION_TOKEN',
    'HYTALE_SERVER_IDENTITY_TOKEN',
    'HYTALE_VERSION',
    'HYTALE_GAMEPANEL_PLUGIN_JAR',
    'HYTALE_REQUIRED_START_PARAMS',
]);

export function getOvhcloudHytaleImage(imageId: string): OvhcloudHytaleImage | null {
    return imageId === HYTALE_IMAGE_ID
        ? { imageId: HYTALE_IMAGE_ID }
        : null;
}

export function assertOvhcloudHytaleServer(server: { provider: string; provider_metadata_json?: string | null }): void {
    if (server.provider !== 'ovhcloud') {
        throw Object.assign(new Error('Feature is only available for OVHcloud Hytale servers'), { statusCode: 501 });
    }

    let metadata: { family?: unknown; serverType?: unknown };
    try {
        metadata = JSON.parse(server.provider_metadata_json || '{}');
    } catch {
        metadata = {};
    }

    if (metadata.family !== 'hytale' || metadata.serverType !== 'hytale') {
        throw Object.assign(new Error('Feature is only available for OVHcloud Hytale servers'), { statusCode: 501 });
    }
}

export function normalizeHytalePatchline(value: unknown): HytalePatchline {
    const patchline = typeof value === 'string' && value.trim()
        ? value.trim()
        : 'release';

    if (!HYTALE_PATCHLINES.includes(patchline as HytalePatchline)) {
        throw Object.assign(new Error('Hytale patchline must be release or pre-release'), { statusCode: 400 });
    }

    return patchline as HytalePatchline;
}

export function normalizeOptionalHytaleProfileUuid(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        throw Object.assign(new Error('Hytale profileUuid must be a string'), { statusCode: 400 });
    }

    const uuid = value.trim();
    if (!UUID_RE.test(uuid)) {
        throw Object.assign(new Error('Hytale profileUuid must be a valid UUID'), { statusCode: 400 });
    }

    return uuid;
}

export function normalizeHytaleEnv(payload: unknown): string[] {
    const env = normalizeEnvPayload(payload);

    for (const entry of env) {
        const separator = entry.indexOf('=');
        const key = separator > 0 ? entry.slice(0, separator) : entry;
        if (RESERVED_ENV_KEYS.has(key)) {
            throw Object.assign(new Error(`${key} is reserved for Hytale servers`), { statusCode: 400 });
        }
    }

    return env;
}

export function buildHytaleProviderMetadata(
    image: OvhcloudHytaleImage,
    patchline: HytalePatchline,
    profileUuid: string | null
): Record<string, unknown> {
    return {
        imageId: image.imageId,
        family: 'hytale',
        serverType: 'hytale',
        patchline,
        profileUuid,
        capabilities: {
            backup: {
                type: 'native',
                path: '/data/game/Server/backups',
                extensions: HYTALE_BACKUP_EXTENSIONS,
                supportsCreate: true,
            },
            restore: {
                type: 'script',
                script: '/app/restore.sh',
                path: '/data/game/Server/backups',
                extensions: HYTALE_BACKUP_EXTENSIONS,
                description: 'Restores Hytale universe backups only',
            },
            consoleCommand: {
                type: 'script',
                script: '/app/send-command.sh',
            },
        },
    };
}
