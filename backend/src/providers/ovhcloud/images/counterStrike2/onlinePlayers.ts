import { queryA2S } from '../../../../services/players/protocols/a2s.js';
import { GAME_PORT_LABEL, resolveContainerPort } from '../../../../services/players/resolve.js';
import type { OvhcloudPlayersSupport } from '../../adapters/types.js';

const DEFAULT_GAME_PORT = 27015;

export const counterStrike2PlayersSupport: OvhcloudPlayersSupport = {
    resolvePort(server): number {
        return resolveContainerPort(server, 'udp', GAME_PORT_LABEL, DEFAULT_GAME_PORT);
    },

    query(_server, target) {
        return queryA2S(target);
    },
};
