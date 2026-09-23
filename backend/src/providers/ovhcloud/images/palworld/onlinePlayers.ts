import { queryPalworldRest } from '../../../../services/players/protocols/palworldRest.js';
import { readEnvValue } from '../../../../services/players/resolve.js';
import type { OvhcloudPlayersSupport } from '../../adapters/types.js';

const ADMIN_PASSWORD_ENV = 'PALWORLD_ADMIN_PASSWORD';

const REST_API_PORT = 8212;

const QUERY_INTERVAL_MS = 60_000;

export const palworldPlayersSupport: OvhcloudPlayersSupport = {
    minIntervalMs: QUERY_INTERVAL_MS,

    resolvePort(server): number | null {
        return readEnvValue(server, ADMIN_PASSWORD_ENV) ? REST_API_PORT : null;
    },

    query(server, target) {
        return queryPalworldRest(target, readEnvValue(server, ADMIN_PASSWORD_ENV) ?? '');
    },
};
