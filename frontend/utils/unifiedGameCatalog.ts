import { OVHCLOUD_IMAGES, type OvhcloudImage } from './ovhcloudCatalog';
import type { LinuxGsmGame } from './linuxGsmCatalog';

export interface OvhUnifiedEntry {
  id: string;
  displayName: string;
  hasVersionSelection: boolean;
  images: OvhcloudImage[];
}

export const OVH_UNIFIED: OvhUnifiedEntry[] = [
  {
    id: 'minecraft',
    displayName: 'Minecraft',
    hasVersionSelection: true,
    images: OVHCLOUD_IMAGES.filter(img => img.family === 'minecraft'),
  },
  {
    id: 'counter-strike-2',
    displayName: 'Counter-Strike 2',
    hasVersionSelection: false,
    images: OVHCLOUD_IMAGES.filter(img => img.family === 'counter-strike'),
  },
  {
    id: 'hytale',
    displayName: 'Hytale',
    hasVersionSelection: false,
    images: OVHCLOUD_IMAGES.filter(img => img.family === 'hytale'),
  },
  {
    id: 'palworld',
    displayName: 'Palworld',
    hasVersionSelection: false,
    images: OVHCLOUD_IMAGES.filter(img => img.family === 'palworld'),
  },
  {
    id: 'project-zomboid',
    displayName: 'Project Zomboid',
    hasVersionSelection: false,
    images: OVHCLOUD_IMAGES.filter(img => img.family === 'project-zomboid'),
  },
  {
    id: 'rust',
    displayName: 'Rust',
    hasVersionSelection: false,
    images: OVHCLOUD_IMAGES.filter(img => img.family === 'rust'),
  },
  {
    id: 'valheim',
    displayName: 'Valheim',
    hasVersionSelection: false,
    images: OVHCLOUD_IMAGES.filter(img => img.family === 'valheim'),
  },
  {
    id: 'garrys-mod',
    displayName: "Garry's Mod",
    hasVersionSelection: false,
    images: OVHCLOUD_IMAGES.filter(img => img.family === 'garrys-mod'),
  },
];

const LGSM_SUPPRESS_SHORTNAMES = new Set(['cs2', 'gmod', 'mc', 'mcb', 'pmc', 'pw', 'pz', 'rust', 'vh']);

export function filterLgsmForUnified(games: LinuxGsmGame[]): LinuxGsmGame[] {
  return games.filter(g => !LGSM_SUPPRESS_SHORTNAMES.has(g.shortname));
}
