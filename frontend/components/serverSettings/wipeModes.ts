export type WipeMode = 'soft' | 'hard';

export interface WipeModeInfo {
  id: WipeMode;
  label: string;
  tone: 'soft' | 'hard';
  reinstall: boolean;
  description: string;
  deleted: string[];
  kept: string[];
  confirmMessage: string;
}

// OVHcloud family → supported modes. Keep in sync with the backend adapters.
const MODES_BY_FAMILY: Record<string, WipeMode[]> = {
  minecraft: ['soft', 'hard'],
  hytale: ['soft'],
  'counter-strike': ['hard'],
  'garrys-mod': ['hard'],
  palworld: ['soft', 'hard'],
  'project-zomboid': ['soft', 'hard'],
  rust: ['soft', 'hard'],
  valheim: ['soft', 'hard'],
};

export function getSupportedWipeModes(family: string | null | undefined): WipeMode[] {
  return (family && MODES_BY_FAMILY[family]) || [];
}

const SOFT_COPY: Record<string, { description: string; deleted: string[]; kept: string[]; confirmMessage?: string }> = {
  'project-zomboid': {
    description: 'Reset the world and player progression, keeping the server setup. A fresh world is generated on the next start.',
    deleted: ['World save (map, loot, zombies)', 'Player characters (inventory, skills, position)'],
    kept: ['Whitelist, accounts, bans & roles', 'Server config (settings)', 'Installed mods', 'Backups'],
  },
  minecraft: {
    description: 'Reset the world(s) and player data, keeping the server setup. A fresh world is generated on the next start.',
    deleted: ['World(s) & player data (Java: overworld/nether/end · Bedrock: active world)'],
    kept: ['server.properties', 'Ops, whitelist & bans', 'Plugins / mods', 'Backups'],
  },
  hytale: {
    description: 'Reset the universe (worlds and players), keeping the server setup. A fresh universe is generated on the next start.',
    deleted: ['Universe (worlds, players)'],
    kept: ['Server config', 'Whitelist & bans', 'Mods', 'Backups'],
  },
  palworld: {
    description: 'Reset the world and player data, keeping the server setup. A fresh world is generated on the next start.',
    deleted: ['World save & player data'],
    kept: ['Server config (settings)', 'Whitelist & bans', 'Backups'],
  },
  rust: {
    description: 'Reset the world and all player data, keeping the server setup. A fresh map is generated on the next start.',
    deleted: ['World save (map + all player data)'],
    kept: ['Server config (cfg/)', 'Oxide + installed plugins & their data', 'Backups'],
  },
  valheim: {
    description: 'Reset the shared world (map, buildings, structures, dropped items), keeping the server setup. A fresh world is generated on the next start. Players keep their characters — Valheim stores them on the client.',
    deleted: ['World save (map, buildings, dropped items) and its .old safety copies'],
    kept: ['Player characters (stored client-side)', 'Automatic world backups', 'Admin, allowed & banned lists', 'Server settings (launch parameters)', 'BepInEx + installed mods'],
    confirmMessage: 'This resets the shared world. Player characters, settings, access lists and mods are kept. There is no automatic backup and it cannot be undone.',
  },
};

const HARD_COPY = {
  description: 'Full reinstall from scratch: wipes every persistent volume, then reinstalls the game keeping the server’s config. The server reinstalls and starts on its own.',
  deleted: ['Everything on disk: world, characters, mods, config files', 'All backups'],
  kept: ['Server config: env, mounts, ports, image'],
};

const SOFT_CONFIRM =
  'This resets the world and player progression. Config, whitelist and mods are kept. There is no automatic backup and it cannot be undone.';
const HARD_CONFIRM =
  'This wipes ALL persistent volumes — world, characters, mods, config files AND backups — then reinstalls the game from scratch. Nothing survives and it cannot be undone.';

export function buildWipeModes(
  family: string | null | undefined,
  perms: { canSoft: boolean; canHard: boolean }
): WipeModeInfo[] {
  const supported = (family && MODES_BY_FAMILY[family]) || [];
  const modes: WipeModeInfo[] = [];

  for (const mode of supported) {
    if (mode === 'soft') {
      const copy = SOFT_COPY[family as string];
      if (!perms.canSoft || !copy) continue;
      modes.push({
        id: 'soft',
        label: 'Soft wipe',
        tone: 'soft',
        reinstall: false,
        description: copy.description,
        deleted: copy.deleted,
        kept: copy.kept,
        confirmMessage: copy.confirmMessage ?? SOFT_CONFIRM,
      });
    } else {
      if (!perms.canHard) continue;
      modes.push({
        id: 'hard',
        label: 'Hard wipe',
        tone: 'hard',
        reinstall: true,
        description: HARD_COPY.description,
        deleted: HARD_COPY.deleted,
        kept: HARD_COPY.kept,
        confirmMessage: HARD_CONFIRM,
      });
    }
  }
  return modes;
}
