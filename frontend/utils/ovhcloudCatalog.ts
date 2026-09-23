import { getAppVersion } from './appInfo';

export interface OvhcloudPort {
  port: number;
  label: string;
}

export interface OvhcloudImage {
  imageId: string;
  name: string;
  family: 'minecraft' | 'counter-strike' | 'hytale' | 'palworld' | 'project-zomboid' | 'rust' | 'valheim' | 'garrys-mod';
  dockerImage: string;
  defaultTcpPorts: OvhcloudPort[];
  defaultUdpPorts: OvhcloudPort[];
  defaultEnv: Record<string, string>;
  requiredEnvKeys: string[];
  supportsHytaleOptions: boolean;
}

const REGISTRY = 'ovhcom';
const VERSION = getAppVersion().replace(/^v/, '');

function ovhImage(name: string): string {
  return `${REGISTRY}/${name}:${VERSION}`;
}

const MINECRAFT_COMMON_ENV: Record<string, string> = {
  EULA: 'FALSE',
  MC_VERSION: 'latest',
};

const MINECRAFT_TCP: OvhcloudPort[] = [{ port: 25565, label: 'Game' }];

function mc(
  imageId: string,
  name: string,
  extraEnv: Record<string, string> = {},
  extraRequired: string[] = []
): OvhcloudImage {
  return {
    imageId,
    name,
    family: 'minecraft',
    dockerImage: ovhImage(`gamepanel-${imageId}`),
    defaultTcpPorts: MINECRAFT_TCP,
    defaultUdpPorts: [],
    defaultEnv: { ...MINECRAFT_COMMON_ENV, ...extraEnv },
    requiredEnvKeys: ['EULA', 'MC_VERSION', ...extraRequired],
    supportsHytaleOptions: false,
  };
}

function mcNeoForge(imageId: string, name: string): OvhcloudImage {
  return {
    imageId,
    name,
    family: 'minecraft',
    dockerImage: ovhImage(`gamepanel-${imageId}`),
    defaultTcpPorts: MINECRAFT_TCP,
    defaultUdpPorts: [],
    defaultEnv: { EULA: 'FALSE', NEOFORGE_VERSION: 'latest' },
    requiredEnvKeys: ['EULA', 'NEOFORGE_VERSION'],
    supportsHytaleOptions: false,
  };
}

export const OVHCLOUD_IMAGES: OvhcloudImage[] = [
  mc('minecraft-paper-java25', 'Minecraft Paper', {
    PAPER_BUILD: 'latest',
    PAPERMC_USER_AGENT: 'gamepanel/1.0',
  }, ['PAPER_BUILD', 'PAPERMC_USER_AGENT']),
  mc('minecraft-paper-java21', 'Minecraft Paper', {
    PAPER_BUILD: 'latest',
    PAPERMC_USER_AGENT: 'gamepanel/1.0',
  }, ['PAPER_BUILD', 'PAPERMC_USER_AGENT']),
  mc('minecraft-paper-java17', 'Minecraft Paper', {
    PAPER_BUILD: 'latest',
    PAPERMC_USER_AGENT: 'gamepanel/1.0',
  }, ['PAPER_BUILD', 'PAPERMC_USER_AGENT']),
  mc('minecraft-paper-java8', 'Minecraft Paper', {
    PAPER_BUILD: 'latest',
    PAPERMC_USER_AGENT: 'gamepanel/1.0',
  }, ['PAPER_BUILD', 'PAPERMC_USER_AGENT']),

  mc('minecraft-java-edition-java25', 'Minecraft Java Edition'),
  mc('minecraft-java-edition-java21', 'Minecraft Java Edition'),
  mc('minecraft-java-edition-java17', 'Minecraft Java Edition'),
  mc('minecraft-java-edition-java8', 'Minecraft Java Edition'),

  mc('minecraft-fabric-java25', 'Minecraft Fabric', {
    FABRIC_LOADER_VERSION: 'latest',
    FABRIC_INSTALLER_VERSION: 'latest',
  }, ['FABRIC_LOADER_VERSION', 'FABRIC_INSTALLER_VERSION']),
  mc('minecraft-fabric-java21', 'Minecraft Fabric', {
    FABRIC_LOADER_VERSION: 'latest',
    FABRIC_INSTALLER_VERSION: 'latest',
  }, ['FABRIC_LOADER_VERSION', 'FABRIC_INSTALLER_VERSION']),
  mc('minecraft-fabric-java17', 'Minecraft Fabric', {
    FABRIC_LOADER_VERSION: 'latest',
    FABRIC_INSTALLER_VERSION: 'latest',
  }, ['FABRIC_LOADER_VERSION', 'FABRIC_INSTALLER_VERSION']),
  mc('minecraft-fabric-java8', 'Minecraft Fabric', {
    FABRIC_LOADER_VERSION: 'latest',
    FABRIC_INSTALLER_VERSION: 'latest',
  }, ['FABRIC_LOADER_VERSION', 'FABRIC_INSTALLER_VERSION']),

  mcNeoForge('minecraft-neoforge-java25', 'Minecraft NeoForge'),
  mcNeoForge('minecraft-neoforge-java21', 'Minecraft NeoForge'),
  mcNeoForge('minecraft-neoforge-java17', 'Minecraft NeoForge'),
  mcNeoForge('minecraft-neoforge-java8', 'Minecraft NeoForge'),

  mc('minecraft-forge-java25', 'Minecraft Forge', { FORGE_VERSION: 'latest' }, ['FORGE_VERSION']),
  mc('minecraft-forge-java21', 'Minecraft Forge', { FORGE_VERSION: 'latest' }, ['FORGE_VERSION']),
  mc('minecraft-forge-java17', 'Minecraft Forge', { FORGE_VERSION: 'latest' }, ['FORGE_VERSION']),
  mc('minecraft-forge-java8', 'Minecraft Forge', { FORGE_VERSION: 'latest' }, ['FORGE_VERSION']),

  {
    imageId: 'minecraft-bedrock-edition',
    name: 'Minecraft Bedrock Edition',
    family: 'minecraft',
    dockerImage: ovhImage('gamepanel-minecraft-bedrock-edition'),
    defaultTcpPorts: [],
    defaultUdpPorts: [{ port: 19132, label: 'Game' }],
    defaultEnv: { EULA: 'FALSE', MC_VERSION: 'latest', BEDROCK_DOWNLOAD_URL: '' },
    requiredEnvKeys: ['EULA', 'MC_VERSION', 'BEDROCK_DOWNLOAD_URL'],
    supportsHytaleOptions: false,
  },

  {
    imageId: 'counter-strike-2',
    name: 'Counter-Strike 2',
    family: 'counter-strike',
    dockerImage: ovhImage('gamepanel-counter-strike-2'),
    defaultTcpPorts: [{ port: 27015, label: 'RCON' }],
    defaultUdpPorts: [{ port: 27015, label: 'Game' }],
    defaultEnv: { CS2_START_PARAMS: '+game_type 0 +game_mode 0 +map de_dust2', CS2_UPDATE_ON_START: 'true' },
    requiredEnvKeys: [],
    supportsHytaleOptions: false,
  },

  {
    imageId: 'hytale',
    name: 'Hytale',
    family: 'hytale',
    dockerImage: ovhImage('gamepanel-hytale-java25'),
    defaultTcpPorts: [],
    defaultUdpPorts: [{ port: 5520, label: 'Game' }],
    defaultEnv: {},
    requiredEnvKeys: [],
    supportsHytaleOptions: true,
  },

  {
    imageId: 'palworld',
    name: 'Palworld',
    family: 'palworld',
    dockerImage: ovhImage('gamepanel-palworld'),
    defaultTcpPorts: [],
    defaultUdpPorts: [
      { port: 8211, label: 'Game' },
      { port: 27015, label: 'Steam Query' },
    ],
    defaultEnv: { PALWORLD_UPDATE_ON_START: 'false' },
    requiredEnvKeys: [],
    supportsHytaleOptions: false,
  },

  {
    imageId: 'project-zomboid',
    name: 'Project Zomboid',
    family: 'project-zomboid',
    dockerImage: ovhImage('gamepanel-project-zomboid'),
    defaultTcpPorts: [],
    defaultUdpPorts: [
      { port: 16261, label: 'Game' },
      { port: 16262, label: 'Direct Connect' },
    ],
    defaultEnv: { PZ_UPDATE_ON_START: 'false' },
    requiredEnvKeys: [],
    supportsHytaleOptions: false,
  },

  // WebRCON (28016/tcp) is intentionally NOT published: the panel reaches RCON from
  // inside the container. Users can add that mapping manually for an external tool.
  {
    imageId: 'rust',
    name: 'Rust',
    family: 'rust',
    dockerImage: ovhImage('gamepanel-rust'),
    defaultTcpPorts: [{ port: 28082, label: 'Rust+ companion app' }],
    defaultUdpPorts: [
      { port: 28015, label: 'Game' },
      { port: 28017, label: 'Steam Query' },
    ],
    defaultEnv: { RUST_UPDATE_ON_START: 'false' },
    requiredEnvKeys: [],
    supportsHytaleOptions: false,
  },

  {
    imageId: 'valheim',
    name: 'Valheim',
    family: 'valheim',
    dockerImage: ovhImage('gamepanel-valheim'),
    defaultTcpPorts: [],
    defaultUdpPorts: [
      { port: 2456, label: 'Game' },
      { port: 2457, label: 'Steam Query' },
    ],
    // Listed in the community browser, which the game only allows with a password — the
    // install form generates one. VALHEIM_SERVER_PASSWORD is added there, not here.
    defaultEnv: {
      VALHEIM_SERVER_NAME: 'Valheim Server',
      VALHEIM_WORLD_NAME: 'Dedicated',
      VALHEIM_PUBLIC: '1',
      VALHEIM_UPDATE_ON_START: 'false',
    },
    requiredEnvKeys: [],
    supportsHytaleOptions: false,
  },

  {
    imageId: 'garrys-mod',
    name: "Garry's Mod",
    family: 'garrys-mod',
    dockerImage: ovhImage('gamepanel-garrys-mod'),
    defaultTcpPorts: [],
    defaultUdpPorts: [{ port: 27015, label: 'Game' }],
    // Sent at install (see garrys-mod-frontend.md §3.1). GMOD_MOUNT_CSS is cheaper to decide
    // here than later; everything else is configured post-install via the settings screen.
    defaultEnv: { GMOD_MOUNT_CSS: 'false', GMOD_UPDATE_ON_START: 'true' },
    requiredEnvKeys: [],
    supportsHytaleOptions: false,
  },
];

// The Java variant of a Minecraft image is the image itself: we ship one per
// (server type × Java major), named "minecraft-<type>-java<N>". Given any variant,
// list its Java siblings so the install flow can swap the image when the resolved
// Java version changes. Returns [] for bedrock and non-minecraft images (no suffix),
// which the picker reads as "no Java select here".
export interface JavaVariant {
  major: number;
  imageId: string;
  dockerImage: string;
}

export function minecraftJavaVariants(imageId: string): JavaVariant[] {
  const base = imageId.replace(/-java\d+$/, '');
  if (base === imageId) return [];
  return OVHCLOUD_IMAGES
    .map((img) => {
      const m = /-java(\d+)$/.exec(img.imageId);
      return m && img.imageId.startsWith(`${base}-java`)
        ? { major: Number(m[1]), imageId: img.imageId, dockerImage: img.dockerImage }
        : null;
    })
    .filter((v): v is JavaVariant => v !== null)
    .sort((a, b) => a.major - b.major);
}
