import type { GameServerRow } from '../types/gameServer.js';
import { parseJsonObject } from '../utils/json.js';
import type { LinuxGsmProviderMetadata, OvhcloudProviderMetadata } from './types.js';

export type OvhcloudMinecraftMetadata = OvhcloudProviderMetadata & {
    family: 'minecraft';
    edition: 'java' | 'bedrock';
    serverType: 'vanilla' | 'paper' | 'fabric' | 'neoforge' | 'bedrock';
};

export type OvhcloudCounterStrike2Metadata = OvhcloudProviderMetadata & {
    family: 'counter-strike';
    edition: '2';
    serverType: 'counter-strike-2';
};

export type OvhcloudHytaleMetadata = OvhcloudProviderMetadata & {
    family: 'hytale';
    serverType: 'hytale';
    patchline: 'release' | 'pre-release';
    profileUuid: string | null;
};

export type OvhcloudPalworldMetadata = OvhcloudProviderMetadata & {
    family: 'palworld';
    serverType: 'palworld';
};

export function getLinuxGsmMetadata(server: GameServerRow): LinuxGsmProviderMetadata {
    if (server.provider !== 'linuxgsm') {
        throw Object.assign(new Error('Feature is only available for LinuxGSM servers'), { statusCode: 501 });
    }

    const metadata = parseJsonObject<Record<string, unknown>>(server.provider_metadata_json, {});
    const shortname = typeof metadata.shortname === 'string' ? metadata.shortname.trim() : '';
    const gameservername = typeof metadata.gameservername === 'string' ? metadata.gameservername.trim() : '';
    const gamename = typeof metadata.gamename === 'string' ? metadata.gamename.trim() : '';
    const os = typeof metadata.os === 'string' && metadata.os.trim() ? metadata.os.trim() : null;

    if (!shortname || !gameservername || !gamename) {
        throw Object.assign(new Error('LinuxGSM metadata is missing or invalid'), { statusCode: 500 });
    }

    return { shortname, gameservername, gamename, os };
}

export function getRuntimeConfig(server: GameServerRow): Record<string, unknown> {
    return parseJsonObject<Record<string, unknown>>(server.runtime_config_json, {});
}

export function getOvhcloudMetadata(server: GameServerRow): OvhcloudProviderMetadata {
    if (server.provider !== 'ovhcloud') {
        throw Object.assign(new Error('Feature is only available for OVHcloud servers'), { statusCode: 501 });
    }

    const metadata = parseJsonObject<Record<string, unknown>>(server.provider_metadata_json, {});
    const imageId = typeof metadata.imageId === 'string' ? metadata.imageId.trim() : '';

    if (!imageId) {
        throw Object.assign(new Error('OVHcloud metadata is missing or invalid'), { statusCode: 500 });
    }

    const capabilities =
        metadata.capabilities && typeof metadata.capabilities === 'object' && !Array.isArray(metadata.capabilities)
            ? metadata.capabilities as Record<string, unknown>
            : {};

    return {
        imageId,
        family: typeof metadata.family === 'string' ? metadata.family : undefined,
        edition: typeof metadata.edition === 'string' ? metadata.edition : undefined,
        serverType: typeof metadata.serverType === 'string' ? metadata.serverType : undefined,
        javaVersion: typeof metadata.javaVersion === 'number' ? metadata.javaVersion : null,
        patchline: typeof metadata.patchline === 'string' ? metadata.patchline : undefined,
        profileUuid: typeof metadata.profileUuid === 'string' ? metadata.profileUuid : null,
        capabilities,
    } as OvhcloudProviderMetadata;
}

export function getOvhcloudMinecraftMetadata(server: GameServerRow): OvhcloudMinecraftMetadata {
    const metadata = getOvhcloudMetadata(server);
    const validEdition = metadata.edition === 'java' || metadata.edition === 'bedrock';
    const validServerType =
        metadata.serverType === 'vanilla' ||
        metadata.serverType === 'paper' ||
        metadata.serverType === 'fabric' ||
        metadata.serverType === 'neoforge' ||
        metadata.serverType === 'bedrock';

    if (metadata.family !== 'minecraft' || !validEdition || !validServerType) {
        throw Object.assign(new Error('Feature is only available for OVHcloud Minecraft servers'), { statusCode: 501 });
    }

    return metadata as OvhcloudMinecraftMetadata;
}

export function getOvhcloudCounterStrike2Metadata(server: GameServerRow): OvhcloudCounterStrike2Metadata {
    const metadata = getOvhcloudMetadata(server);

    if (
        metadata.family !== 'counter-strike' ||
        metadata.edition !== '2' ||
        metadata.serverType !== 'counter-strike-2'
    ) {
        throw Object.assign(new Error('Feature is only available for OVHcloud Counter-Strike 2 servers'), { statusCode: 501 });
    }

    return metadata as OvhcloudCounterStrike2Metadata;
}

export function getOvhcloudHytaleMetadata(server: GameServerRow): OvhcloudHytaleMetadata {
    const metadata = getOvhcloudMetadata(server) as OvhcloudProviderMetadata & {
        patchline?: string;
        profileUuid?: string | null;
    };

    if (
        metadata.family !== 'hytale' ||
        metadata.serverType !== 'hytale' ||
        (metadata.patchline !== 'release' && metadata.patchline !== 'pre-release')
    ) {
        throw Object.assign(new Error('Feature is only available for OVHcloud Hytale servers'), { statusCode: 501 });
    }

    return {
        ...metadata,
        patchline: metadata.patchline,
        profileUuid: metadata.profileUuid ?? null,
    } as OvhcloudHytaleMetadata;
}

export function getOvhcloudPalworldMetadata(server: GameServerRow): OvhcloudPalworldMetadata {
    const metadata = getOvhcloudMetadata(server);

    if (metadata.family !== 'palworld' || metadata.serverType !== 'palworld') {
        throw Object.assign(new Error('Feature is only available for OVHcloud Palworld servers'), { statusCode: 501 });
    }

    return metadata as OvhcloudPalworldMetadata;
}
