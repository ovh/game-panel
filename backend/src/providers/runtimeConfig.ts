import type { GameServerRow } from '../types/gameServer.js';
import type { NormalizedHealthcheck } from '../utils/healthcheck.js';
import { parseJsonArray, parseJsonObject } from '../utils/json.js';
import type { NormalizedMount } from '../utils/mounts.js';
import type { NormalizedPorts } from '../utils/ports.js';
import { parseStoredResourceLimits as parseStoredResourceLimitsFromJson, type NormalizedResourceLimits } from '../utils/resourceLimits.js';
import type { ServerMountOwnership } from '../utils/storage.js';
import { getRuntimeConfig } from './serverMetadata.js';

export function parseStoredPorts(server: GameServerRow): NormalizedPorts {
    return parseJsonObject(server.ports_json, { tcp: [], udp: [] }) as NormalizedPorts;
}

export function parseStoredMounts(server: GameServerRow): NormalizedMount[] {
    return parseJsonArray<Record<string, unknown>>(server.mounts_json, [])
        .filter((mount) => typeof mount.key === 'string' && typeof mount.containerPath === 'string')
        .map((mount) => ({
            key: String(mount.key),
            containerPath: String(mount.containerPath),
        }));
}

export function parseStoredEnv(server: GameServerRow): string[] {
    return parseJsonArray<unknown>(server.env_json, [])
        .map((entry) => String(entry))
        .filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(entry));
}

export function parseStoredHealthcheck(server: GameServerRow): NormalizedHealthcheck | null {
    if (!server.healthcheck_json) return null;

    try {
        const parsed = JSON.parse(server.healthcheck_json);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as NormalizedHealthcheck
            : null;
    } catch {
        return null;
    }
}

export function parseStoredResourceLimits(server: GameServerRow): NormalizedResourceLimits {
    return parseStoredResourceLimitsFromJson(server);
}

export function getRuntimeOwnership(server: GameServerRow): ServerMountOwnership | undefined {
    const runtime = getRuntimeConfig(server);
    const uid = Number(runtime.volumeUid);
    const gid = Number(runtime.volumeGid);

    if (!Number.isInteger(uid) || !Number.isInteger(gid)) return undefined;
    return { uid, gid };
}

export function hasStoredMount(mounts: NormalizedMount[], key: string, containerPath: string): boolean {
    return mounts.some((mount) => mount.key === key && mount.containerPath === containerPath);
}
