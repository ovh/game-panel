export type PlayersSample = {
    online: number | null;
    max: number | null;
    names: string[] | null;
};

export type PlayersQueryTarget = {
    host: string;
    port: number;
};

export const PLAYERS_QUERY_TIMEOUT_MS = 2_000;
