/**
 * App-owned localStorage keys that cache server/host operational data
 * (resource-usage history, latest metrics, table preferences). These outlive the
 * auth token, so they must be cleared on logout / session expiry to avoid leaking
 * the previous user's infrastructure data on a shared machine.
 */
const APP_CACHE_KEYS = [
  'system_metrics_latest',
  'system_history_raw',
  'system_history_cpu',
  'system_history_ram',
  'system_history_disk',
  'system_history_network',
  'gp_visible_metrics',
] as const;

export function clearAppCache() {
  if (typeof localStorage === 'undefined') return;
  APP_CACHE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage access errors (private mode / quota).
    }
  });
}
