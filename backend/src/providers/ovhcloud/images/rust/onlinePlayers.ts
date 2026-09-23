import { queryA2S } from '../../../../services/players/protocols/a2s.js';
import { readEnvPort } from '../../../../services/players/resolve.js';
import type { OvhcloudPlayersSupport } from '../../adapters/types.js';

const QUERY_PORT_ENV = 'RUST_QUERY_PORT';
const DEFAULT_QUERY_PORT = 28017;

export const rustPlayersSupport: OvhcloudPlayersSupport = {
    resolvePort(server): number {
        return readEnvPort(server, QUERY_PORT_ENV) ?? DEFAULT_QUERY_PORT;
    },

    query(_server, target) {
        return queryA2S(target);
    },
};
