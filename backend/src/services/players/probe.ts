import type { GameServerRow } from '../../types/gameServer.js';
import { getOvhcloudServerAdapter } from '../../providers/ovhcloud/adapters/registry.js';
import type { OvhcloudPlayersSupport } from '../../providers/ovhcloud/adapters/types.js';
import { buildServerNetworkAlias } from '../../utils/docker.js';
import type { PlayersSample } from './types.js';

function getPlayersSupport(server: GameServerRow): OvhcloudPlayersSupport | null {
    if (server.provider !== 'ovhcloud') return null;

    try {
        return getOvhcloudServerAdapter(server).players ?? null;
    } catch {
        return null;
    }
}

export function supportsPlayerQuery(server: GameServerRow): boolean {
    return getPlayersSupport(server) !== null;
}

export function getPlayersQueryIntervalMs(server: GameServerRow): number {
    return getPlayersSupport(server)?.minIntervalMs ?? 0;
}

export async function probeServerPlayers(server: GameServerRow): Promise<PlayersSample | null> {
    const support = getPlayersSupport(server);
    if (!support) return null;

    const port = support.resolvePort(server);
    if (!port) return null;

    const sample = await support.query(server, { host: buildServerNetworkAlias(server.id), port });
    const value = support.sanitize ? support.sanitize(server, sample) : sample;
    if (!value) return null;

    if (value.online === null && value.max === null && value.names === null) return null;

    return value;
}
