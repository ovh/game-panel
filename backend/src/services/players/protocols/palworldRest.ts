import { PLAYERS_QUERY_TIMEOUT_MS, type PlayersQueryTarget, type PlayersSample } from '../types.js';

const REST_USER = 'admin';

export async function queryPalworldRest(
    target: PlayersQueryTarget,
    adminPassword: string,
): Promise<PlayersSample> {
    const credentials = Buffer.from(`${REST_USER}:${adminPassword}`).toString('base64');

    const response = await fetch(`http://${target.host}:${target.port}/v1/api/players`, {
        headers: {
            Authorization: `Basic ${credentials}`,
            Accept: 'application/json',
        },
        signal: AbortSignal.timeout(PLAYERS_QUERY_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`Palworld REST API answered ${response.status}`);
    }

    const body = (await response.json()) as { players?: unknown };
    const players = Array.isArray(body.players) ? body.players : [];

    const names = players
        .map((player) => (player as { name?: unknown })?.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0);

    return { online: players.length, max: null, names };
}
