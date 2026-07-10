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
];

const LGSM_SUPPRESS_SHORTNAMES = new Set(['cs2', 'mc', 'mcb', 'pmc', 'pw']);

export function filterLgsmForUnified(games: LinuxGsmGame[]): LinuxGsmGame[] {
  return games.filter(g => !LGSM_SUPPRESS_SHORTNAMES.has(g.shortname));
}
