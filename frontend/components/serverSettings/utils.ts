import { isServerDownLike } from '../../utils/serverRuntime';

export const normalizeConfigPath = (raw: string) => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
  if (!cleaned) return '';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
};

const normalizePath = (raw: string) => {
  if (!raw || raw === '/') return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

export const joinPath = (base: string, name: string) => {
  const safeBase = normalizePath(base);
  if (safeBase === '/') return `/${name}`;
  return `${safeBase}/${name}`;
};

const normalizeFilePath = (raw: string) => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
  if (!cleaned) return '/';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
};

export const splitFilePath = (fullPath: string) => {
  const normalized = normalizeFilePath(fullPath);
  const parts = normalized.split('/').filter(Boolean);
  const fileName = parts.pop() || '';
  const directory = parts.length > 0 ? `/${parts.join('/')}` : '/';
  return { normalized, directory, fileName };
};

export const isSymlinkEntry = (file: { type?: string } | null | undefined): boolean =>
  file?.type === 'symlink';

// Read a server's container env into a flat map, tolerating the shapes the API may
// return it in: an object, a KEY=VALUE string array, or a JSON-encoded string of either.
export const envFromServer = (server: unknown): Record<string, string> => {
  const raw = (server as any)?.env ?? (server as any)?.env_json ?? {};
  const parsed: Record<string, string> = {};
  const fromArray = (arr: unknown[]) => {
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const idx = item.indexOf('=');
      if (idx >= 0) parsed[item.slice(0, idx)] = item.slice(idx + 1);
    }
  };
  if (typeof raw === 'string') {
    try {
      const decoded = JSON.parse(raw);
      if (Array.isArray(decoded)) fromArray(decoded);
      else if (decoded && typeof decoded === 'object') Object.assign(parsed, decoded);
    } catch { /* empty */ }
  } else if (Array.isArray(raw)) {
    fromArray(raw);
  } else if (raw && typeof raw === 'object') {
    Object.assign(parsed, raw as Record<string, string>);
  }
  return parsed;
};

export const getApiErrorMessage = (error: any): string => {
  const responseData = error?.response?.data;
  if (typeof responseData === 'string' && responseData.trim()) return responseData;
  if (typeof responseData?.error === 'string' && responseData.error.trim()) return responseData.error;
  if (typeof responseData?.message === 'string' && responseData.message.trim())
    return responseData.message;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  return '';
};

export const isServerBusyForFileMutations = (status: string | undefined): boolean => {
  // Only up-like states (running/unhealthy) block file mutations.
  return !isServerDownLike(status);
};

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
};

export const formatTime = (hour: number, minute: number) => {
  const h = String(Math.max(0, Math.min(23, hour))).padStart(2, '0');
  const m = String(Math.max(0, Math.min(59, minute))).padStart(2, '0');
  return `${h}:${m}`;
};
