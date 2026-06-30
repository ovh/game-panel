import type { GameServerRow } from '../../../types/gameServer.js';
import { getOvhcloudMetadata } from '../../serverMetadata.js';
import { counterStrike2Adapter } from './counterStrike2.js';
import { hytaleAdapter } from './hytale.js';
import { minecraftAdapter } from './minecraft.js';
import type { OvhcloudImageAdapter } from './types.js';

const KNOWN_OVHCLOUD_ADAPTERS: OvhcloudImageAdapter[] = [
    minecraftAdapter,
    counterStrike2Adapter,
    hytaleAdapter,
];

export function getKnownOvhcloudAdapters(): OvhcloudImageAdapter[] {
    return [...KNOWN_OVHCLOUD_ADAPTERS];
}

export function getOvhcloudImageAdapter(imageId: string): OvhcloudImageAdapter {
    const adapter = KNOWN_OVHCLOUD_ADAPTERS.find((entry) => entry.supportsImageId(imageId));
    if (!adapter) {
        throw Object.assign(new Error(`Unsupported OVHcloud imageId: ${imageId}`), { statusCode: 400 });
    }
    return adapter;
}

export function getOvhcloudServerAdapter(server: GameServerRow): OvhcloudImageAdapter {
    if (server.provider !== 'ovhcloud') {
        throw Object.assign(new Error('Feature is only available for OVHcloud servers'), { statusCode: 501 });
    }

    const metadata = getOvhcloudMetadata(server);

    const adapter = KNOWN_OVHCLOUD_ADAPTERS.find((entry) => entry.supportsServer(server));
    if (!adapter) {
        throw Object.assign(new Error(`Unsupported OVHcloud imageId: ${metadata.imageId}`), { statusCode: 501 });
    }
    return adapter;
}
