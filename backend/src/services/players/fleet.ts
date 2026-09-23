import { serverRepository } from '../../database/index.js';
import type { GameServerRow } from '../../types/gameServer.js';
import {
    clearPlayersSamples,
    forgetPlayersSample,
    recordPlayersFailure,
    retainPlayersSamples,
    setPlayersSample,
} from '../../utils/playersCache.js';
import { getPlayersQueryIntervalMs, probeServerPlayers, supportsPlayerQuery } from './probe.js';

const QUERY_CONCURRENCY = 8;

const lastProbedAt = new Map<number, number>();

let inFlight: Promise<void> | null = null;

function isDue(server: GameServerRow, now: number): boolean {
    const interval = getPlayersQueryIntervalMs(server);
    if (interval <= 0) return true;

    const last = lastProbedAt.get(server.id);
    return last === undefined || now - last >= interval;
}

async function probeServer(server: GameServerRow): Promise<void> {
    lastProbedAt.set(server.id, Date.now());

    try {
        const sample = await probeServerPlayers(server);

        if (sample) setPlayersSample(server.id, sample);
        else forgetPlayersSample(server.id);
    } catch {
        recordPlayersFailure(server.id);
    }
}

async function runRefresh(): Promise<void> {
    const servers = (await serverRepository.findRunningServers()).filter((server: GameServerRow) =>
        supportsPlayerQuery(server)
    );

    retainPlayersSamples(servers.map((server: GameServerRow) => server.id));

    const now = Date.now();
    const due = servers.filter((server: GameServerRow) => isDue(server, now));

    for (let index = 0; index < due.length; index += QUERY_CONCURRENCY) {
        await Promise.all(due.slice(index, index + QUERY_CONCURRENCY).map(probeServer));
    }
}

export function refreshPlayersCache(): Promise<void> {
    inFlight ??= runRefresh().finally(() => {
        inFlight = null;
    });

    return inFlight;
}

export function resetPlayersCache(): void {
    clearPlayersSamples();
    lastProbedAt.clear();
}
