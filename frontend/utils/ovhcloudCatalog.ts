import { getAppVersion } from './appInfo';

export interface OvhcloudPort {
  port: number;
  label: string;
}

export interface OvhcloudImage {
  imageId: string;
  name: string;
  family: 'minecraft' | 'counter-strike' | 'hytale';
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
  JAVA_XMX: '6G',
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
    defaultEnv: { EULA: 'FALSE', NEOFORGE_VERSION: 'latest', JAVA_XMX: '6G' },
    requiredEnvKeys: ['EULA', 'NEOFORGE_VERSION'],
    supportsHytaleOptions: false,
  };
}

export const OVHCLOUD_IMAGES: OvhcloudImage[] = [
  // --- Minecraft Paper ---
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

  // --- Minecraft Java Edition ---
  mc('minecraft-java-edition-java25', 'Minecraft Java Edition'),
  mc('minecraft-java-edition-java21', 'Minecraft Java Edition'),
  mc('minecraft-java-edition-java17', 'Minecraft Java Edition'),
  mc('minecraft-java-edition-java8', 'Minecraft Java Edition'),

  // --- Minecraft Fabric ---
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

  // --- Minecraft NeoForge ---
  mcNeoForge('minecraft-neoforge-java25', 'Minecraft NeoForge'),
  mcNeoForge('minecraft-neoforge-java21', 'Minecraft NeoForge'),
  mcNeoForge('minecraft-neoforge-java17', 'Minecraft NeoForge'),
  mcNeoForge('minecraft-neoforge-java8', 'Minecraft NeoForge'),

  // --- Minecraft Bedrock ---
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

  // --- Counter-Strike 2 ---
  {
    imageId: 'counter-strike-2',
    name: 'Counter-Strike 2',
    family: 'counter-strike',
    dockerImage: ovhImage('gamepanel-counter-strike-2'),
    defaultTcpPorts: [{ port: 27015, label: 'Game' }],
    defaultUdpPorts: [{ port: 27015, label: 'Game' }],
    defaultEnv: { CS2_START_PARAMS: '+game_type 0 +game_mode 0 +map de_dust2' },
    requiredEnvKeys: [],
    supportsHytaleOptions: false,
  },

  // --- Hytale ---
  {
    imageId: 'hytale',
    name: 'Hytale',
    family: 'hytale',
    dockerImage: ovhImage('gamepanel-hytale-java25'),
    defaultTcpPorts: [],
    defaultUdpPorts: [{ port: 5520, label: 'Game' }],
    defaultEnv: { JAVA_XMX: '6G' },
    requiredEnvKeys: [],
    supportsHytaleOptions: true,
  },
];

export const OVHCLOUD_IMAGES_BY_ID = Object.fromEntries(
  OVHCLOUD_IMAGES.map((image) => [image.imageId, image])
);
