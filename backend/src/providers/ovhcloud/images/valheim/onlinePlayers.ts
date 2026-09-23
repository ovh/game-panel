import type { GameServerRow } from '../../../../types/gameServer.js';
import { queryA2S } from '../../../../services/players/protocols/a2s.js';
import { readEnvPort, readEnvValue } from '../../../../services/players/resolve.js';
import type { PlayersSample } from '../../../../services/players/types.js';
import type { OvhcloudPlayersSupport } from '../../adapters/types.js';

const GAME_PORT_ENV = 'VALHEIM_PORT';
const START_PARAMS_ENV = 'VALHEIM_START_PARAMS';
const DEFAULT_GAME_PORT = 2456;

function isCrossplay(server: GameServerRow): boolean {
    return /(^|\s)-crossplay(\s|$)/.test(readEnvValue(server, START_PARAMS_ENV) ?? '');
}

export const valheimPlayersSupport: OvhcloudPlayersSupport = {
    resolvePort(server): number {
        return (readEnvPort(server, GAME_PORT_ENV) ?? DEFAULT_GAME_PORT) + 1;
    },

    query(_server, target) {
        return queryA2S(target);
    },

    sanitize(server, sample): PlayersSample | null {
        return isCrossplay(server) ? null : sample;
    },
};
