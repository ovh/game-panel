import type { PlayersSample } from '../services/players/types.js';

export type ServerPlayersSample = { serverId: number } & PlayersSample;

const FAILURE_TOLERANCE = 3;

type CacheEntry = {
    sample: PlayersSample;
    failures: number;
};

const cache = new Map<number, CacheEntry>();

export function setPlayersSample(serverId: number, sample: PlayersSample): void {
    cache.set(serverId, { sample, failures: 0 });
}

export function recordPlayersFailure(serverId: number): void {
    const entry = cache.get(serverId);
    if (!entry) return;

    entry.failures += 1;
    if (entry.failures >= FAILURE_TOLERANCE) cache.delete(serverId);
}

export function forgetPlayersSample(serverId: number): void {
    cache.delete(serverId);
}

export function retainPlayersSamples(serverIds: Iterable<number>): void {
    const keep = new Set(serverIds);

    for (const serverId of cache.keys()) {
        if (!keep.has(serverId)) cache.delete(serverId);
    }
}

export function clearPlayersSamples(): void {
    cache.clear();
}

export function hasPlayersSamples(): boolean {
    return cache.size > 0;
}

export function getPlayersSamples(): ServerPlayersSample[] {
    return [...cache.entries()]
        .map(([serverId, entry]) => ({ serverId, ...entry.sample }))
        .sort((a, b) => a.serverId - b.serverId);
}
