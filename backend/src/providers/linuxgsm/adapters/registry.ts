import type { GameAdapter } from './types.js';
import { genericAdapter } from './generic/index.js';
import { vhAdapter } from './vh/index.js';

const registry: Record<string, GameAdapter> = {
    vh: vhAdapter,
};

export function getGameAdapter(shortname: string): GameAdapter {
    return registry[shortname] ?? genericAdapter;
}
