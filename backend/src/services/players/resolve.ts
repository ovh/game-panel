import type { GameServerRow } from '../../types/gameServer.js';
import { parseStoredEnv, parseStoredPorts } from '../../providers/runtimeConfig.js';

export const GAME_PORT_LABEL = /game/i;
export const QUERY_PORT_LABEL = /query/i;

export function resolveContainerPort(
    server: GameServerRow,
    protocol: 'tcp' | 'udp',
    label: RegExp,
    fallback: number,
): number {
    const ports = parseStoredPorts(server);
    const entry = ports[protocol].find((mapping) => label.test(mapping.label ?? ''));

    return entry?.container ?? fallback;
}

export function readEnvValue(server: GameServerRow, key: string): string | null {
    const prefix = `${key}=`;
    const entry = parseStoredEnv(server).find((line) => line.startsWith(prefix));

    return entry ? entry.slice(prefix.length) : null;
}

export function readEnvPort(server: GameServerRow, key: string): number | null {
    const raw = readEnvValue(server, key);
    if (raw === null) return null;

    const value = Number.parseInt(raw, 10);
    return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : null;
}
