import { API_BASE_URL, getStoredToken } from './api/runtime';

export interface LinuxGsmGame {
  shortname: string;
  gameservername: string;
  gamename: string;
  os: string | null;
  dockerImage: string;
}

export async function getLinuxGsmGames(): Promise<LinuxGsmGame[]> {
  try { localStorage.removeItem('linuxgsm_catalog_v1'); } catch { /* ignore */ }

  const token = getStoredToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/catalog/linuxgsm/games`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.json() as { games: LinuxGsmGame[] };
    return body.games ?? [];
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
