const getBrowserOrigin = (): string =>
  typeof window !== 'undefined' ? window.location.origin : '';

const getBrowserProtocol = (): string =>
  typeof window !== 'undefined' ? window.location.protocol : 'http:';

const getBrowserHost = (): string => (typeof window !== 'undefined' ? window.location.host : '');

const getBrowserHostname = (): string =>
  typeof window !== 'undefined' ? window.location.hostname : '';

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');
const readEnvUrl = (value: string | undefined): string => String(value ?? '').trim();

const browserOrigin = getBrowserOrigin();
export const API_BASE_URL = normalizeBaseUrl(
  readEnvUrl(import.meta.env.VITE_API_BASE_URL) || browserOrigin
);
export const CATALOG_BASE_URL = normalizeBaseUrl(
  readEnvUrl(import.meta.env.VITE_DB_API_BASE_URL) || API_BASE_URL || browserOrigin
);

export const PUBLIC_CONNECTION_HOST = (() => {
  try {
    return new URL(API_BASE_URL).hostname || getBrowserHostname();
  } catch {
    return getBrowserHostname();
  }
})();

const deriveWsUrl = (apiBaseUrl: string): string => {
  try {
    const url = new URL(apiBaseUrl);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${url.host}`;
  } catch {
    const wsProtocol = getBrowserProtocol() === 'https:' ? 'wss:' : 'ws:';
    const host = getBrowserHost();
    return host ? `${wsProtocol}//${host}` : '';
  }
};

const rawWsUrl = readEnvUrl(import.meta.env.VITE_WS_URL) || deriveWsUrl(API_BASE_URL || browserOrigin);
export const WS_URL = (() => {
  try {
    const parsed = new URL(rawWsUrl);
    const isHttpsPage = getBrowserProtocol() === 'https:';
    if (isHttpsPage) {
      parsed.protocol = 'wss:';
    }
    return parsed.toString();
  } catch {
    return getBrowserProtocol() === 'https:' ? rawWsUrl.replace(/^ws:/, 'wss:') : rawWsUrl;
  }
})();

export const AUTH_TOKEN_KEY = 'auth_token';

const getCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
};

export const setCookieValue = (name: string, value: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
};

export const clearCookieValue = (name: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
};

export const getStoredToken = (): string | null => {
  return localStorage.getItem(AUTH_TOKEN_KEY) || getCookieValue(AUTH_TOKEN_KEY);
};
