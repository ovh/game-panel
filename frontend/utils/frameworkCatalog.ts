import { CATALOG_BASE_URL } from './api/runtime';

export interface FrameworkVersion {
  version: string;
  type: 'release' | 'pre-release';
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

export async function fetchMetamodVersions(): Promise<FrameworkVersion[] | null> {
  const data = await catalogGet<{ versions: FrameworkVersion[] }>('/metamod/versions');
  return data?.versions ?? null;
}

export async function fetchCounterStrikeSharpVersions(): Promise<FrameworkVersion[] | null> {
  const data = await catalogGet<{ versions: FrameworkVersion[] }>('/counterstrikesharp/versions');
  return data?.versions ?? null;
}
