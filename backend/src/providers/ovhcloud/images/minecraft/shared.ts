import { promises as fs } from 'node:fs';
import { getOvhcloudMinecraftMetadata } from '../../../serverMetadata.js';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { resolveServerPath } from '../../../../services/fileExplorer.js';
import { ensureIsFile } from '../../../../utils/fsBrowser.js';

export type GameServerWithContainer = GameServerRow & {
    docker_container_id: string;
};

export function assertOvhcloudMinecraftJavaServer(server: GameServerRow): void {
    const metadata = getOvhcloudMinecraftMetadata(server);

    if (metadata.edition !== 'java') {
        throw Object.assign(new Error('Feature is only available for OVHcloud Minecraft Java servers'), { statusCode: 501 });
    }
}

export function assertOvhcloudMinecraftBedrockServer(server: GameServerRow): void {
    const metadata = getOvhcloudMinecraftMetadata(server);

    if (metadata.edition !== 'bedrock') {
        throw Object.assign(new Error('Feature is only available for OVHcloud Minecraft Bedrock servers'), { statusCode: 501 });
    }
}

export function invalidInput(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 400 });
}

export async function resolveDataFile(serverId: number, apiPath: string): Promise<{ absPath: string; rootDir: string }> {
    const resolved = await resolveServerPath({ serverId, root: 'data', path: apiPath });
    return {
        absPath: resolved.absPath,
        rootDir: resolved.rootDir,
    };
}

export async function readRequiredTextFile(serverId: number, apiPath: string): Promise<string> {
    const resolved = await resolveDataFile(serverId, apiPath);
    await ensureIsFile(resolved.absPath, resolved.rootDir);
    return fs.readFile(resolved.absPath, 'utf8');
}
