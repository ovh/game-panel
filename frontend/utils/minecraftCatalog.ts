import { CATALOG_BASE_URL } from './api/runtime';

export type McServerType = 'vanilla' | 'paper' | 'fabric' | 'neoforge' | 'bedrock';

export interface JavaVersion {
  version: string;
  type: 'release' | 'snapshot';
  javaVersion: number;
}

export interface PaperBuild {
  build: number;
  channel: string;
}

export interface FabricVersion {
  version: string;
  stable: boolean;
}

export interface NeoForgeVersion {
  version: string;
  minecraftVersion: string;
  channel: string;
}

export interface BedrockVersion {
  channel: 'release' | 'preview';
  version: string;
  downloadUrl: string;
}

export function getMcServerType(imageId: string): McServerType | null {
  if (imageId.includes('paper')) return 'paper';
  if (imageId.includes('fabric')) return 'fabric';
  if (imageId.includes('neoforge')) return 'neoforge';
  if (imageId.includes('bedrock')) return 'bedrock';
  if (imageId.includes('java-edition')) return 'vanilla';
  return null;
}

export function getPickerManagedKeys(serverType: McServerType): string[] {
  switch (serverType) {
    case 'vanilla': return ['MC_VERSION'];
    case 'paper': return ['MC_VERSION', 'PAPER_BUILD', 'PAPERMC_USER_AGENT'];
    case 'fabric': return ['MC_VERSION', 'FABRIC_LOADER_VERSION', 'FABRIC_INSTALLER_VERSION'];
    case 'neoforge': return ['NEOFORGE_VERSION', 'MC_VERSION'];
    case 'bedrock': return ['MC_VERSION', 'BEDROCK_DOWNLOAD_URL'];
  }
}

async function catalogGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${CATALOG_BASE_URL}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchJavaVersions(): Promise<JavaVersion[] | null> {
  const data = await catalogGet<{ versions: JavaVersion[] }>('/minecraft/java/versions');
  return data?.versions ?? null;
}

export async function fetchPaperVersions(): Promise<string[] | null> {
  const data = await catalogGet<{ versions: { version: string }[] }>('/minecraft/paper/versions');
  return data?.versions.map((v) => v.version) ?? null;
}

export async function fetchPaperBuilds(mcVersion: string): Promise<PaperBuild[] | null> {
  const data = await catalogGet<{ builds: PaperBuild[] }>(
    `/minecraft/paper/versions/${encodeURIComponent(mcVersion)}/builds`
  );
  return data?.builds ?? null;
}

export async function fetchFabricVersions(): Promise<FabricVersion[] | null> {
  const data = await catalogGet<{ versions: FabricVersion[] }>('/minecraft/fabric/versions');
  return data?.versions ?? null;
}

export async function fetchFabricLoaders(): Promise<FabricVersion[] | null> {
  const data = await catalogGet<{ loaders: FabricVersion[] }>('/minecraft/fabric/loaders');
  return data?.loaders ?? null;
}

export async function fetchFabricInstallers(): Promise<FabricVersion[] | null> {
  const data = await catalogGet<{ installers: FabricVersion[] }>('/minecraft/fabric/installers');
  return data?.installers ?? null;
}

export async function fetchNeoForgeVersions(): Promise<NeoForgeVersion[] | null> {
  const data = await catalogGet<{ versions: NeoForgeVersion[] }>('/minecraft/neoforge/versions');
  return data?.versions ?? null;
}

export async function fetchBedrockVersions(): Promise<BedrockVersion[] | null> {
  const data = await catalogGet<{ versions: BedrockVersion[] }>('/minecraft/bedrock/versions');
  return data?.versions ?? null;
}
