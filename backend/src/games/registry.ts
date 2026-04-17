import type { GameAdapter } from './types.js';
import { genericAdapter } from './generic/index.js';
import { hzAdapter } from './hz/index.js';
import { mcAdapter } from './mc/index.js';
import { vhAdapter } from './vh/index.js';

const registry: Record<string, GameAdapter> = {
    hz: hzAdapter,
    mc: mcAdapter,
    vh: vhAdapter,
};

export function getGameAdapter(gameKey: string): GameAdapter {
    return registry[gameKey] ?? genericAdapter;
}
