import type { AuthUser } from '../../utils/permissions';
import {
  formatServerStatusLabel,
  isServerRunningStatus,
  mapBackendStatusToUi,
  type ServerHistoryEntry,
} from '../../utils/serverRuntime';

export type SortField = 'name' | 'game' | 'status' | null;
export type SortOrder = 'asc' | 'desc';
export type MetricType = 'cpu' | 'memory';

export const METRICS_HISTORY_REQUEST_LIMIT = 2000;
const METRIC_TIMELINE_MAX_MS = 24 * 60 * 60 * 1000;
const METRIC_GAP_THRESHOLD_MS = 60 * 60 * 1000;

const metricTickSameDayFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const metricTickFullFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const metricTooltipFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const SERVER_SETTINGS_PERMISSIONS = [
  'server.power',
  'server.gamesettings.write',
  'fs.read',
  'fs.write',
  'backups.download',
  'backups.create',
  'backups.settings.write',
  'backups.delete',
  'sftp.manage',
  'ssh.terminal',
];

export function hasServerPermission(
  currentUser: AuthUser | null | undefined,
  permissionsByServer: Record<string, string[]> | undefined,
  serverId: string,
  permission: string
) {
  if (currentUser?.isRoot) return true;
  const permissions = permissionsByServer?.[serverId] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function canOpenServerSettings(
  currentUser: AuthUser | null | undefined,
  permissionsByServer: Record<string, string[]> | undefined,
  serverId: string
) {
  if (currentUser?.isRoot) return true;

  const permissions = permissionsByServer?.[serverId] || [];
  if (permissions.includes('*')) return true;

  return SERVER_SETTINGS_PERMISSIONS.some((permission) => permissions.includes(permission));
}

export function formatMetricValue(status: string, metric?: number) {
  if (!isServerRunningStatus(status)) return '-';
  if (metric === undefined || metric === null) return 'Loading';
  return `${metric.toFixed(2)}%`;
}

export function getServerStatusPresentation(status: string) {
  const normalizedStatus = mapBackendStatusToUi(status);

  switch (normalizedStatus) {
    case 'running':
      return {
        normalizedStatus,
        label: formatServerStatusLabel(normalizedStatus),
        className: 'bg-green-900/40 text-green-400 border-green-500/30',
      };
    case 'installing':
      return {
        normalizedStatus,
        label: formatServerStatusLabel(normalizedStatus),
        className: 'bg-blue-900/40 text-blue-300 border-blue-500/30',
      };
    case 'starting':
      return {
        normalizedStatus,
        label: formatServerStatusLabel(normalizedStatus),
        className: 'bg-cyan-900/40 text-cyan-300 border-cyan-500/30',
      };
    case 'stopping':
      return {
        normalizedStatus,
        label: formatServerStatusLabel(normalizedStatus),
        className: 'bg-orange-900/40 text-orange-300 border-orange-500/30',
      };
    case 'restarting':
      return {
        normalizedStatus,
        label: formatServerStatusLabel(normalizedStatus),
        className: 'bg-yellow-900/40 text-yellow-300 border-yellow-500/30',
      };
    case 'stopped':
    default:
      return {
        normalizedStatus: 'stopped' as const,
        label: formatServerStatusLabel('stopped'),
        className: 'bg-red-900/40 text-red-400 border-red-500/30',
      };
  }
}

function estimateMetricStepMs<T extends { timestamp: number }>(data: T[]): number {
  if (data.length < 2) return 60 * 1000;

  const sampleStartIndex = Math.max(1, data.length - 120);
  let totalDelta = 0;
  let deltaCount = 0;

  for (let index = sampleStartIndex; index < data.length; index += 1) {
    const delta = data[index].timestamp - data[index - 1].timestamp;
    if (delta > 0 && delta < METRIC_GAP_THRESHOLD_MS * 2) {
      totalDelta += delta;
      deltaCount += 1;
    }
  }

  if (deltaCount === 0) return 60 * 1000;
  return totalDelta / deltaCount;
}

export function getMetricZoomedData<T extends { timestamp: number }>(
  data: T[],
  zoomLevel: number,
  offset: number
): T[] {
  if (!data.length) return data;

  const earliestTimestamp = data[0].timestamp;
  const latestTimestamp = data[data.length - 1].timestamp;
  const timelineEndMs = Math.max(Date.now(), latestTimestamp);
  const timelineSpanMs = Math.max(0, timelineEndMs - earliestTimestamp);
  const maxWindowMs = Math.max(15 * 60 * 1000, Math.min(METRIC_TIMELINE_MAX_MS, timelineSpanMs));
  const visibleWindowMs = Math.max(15 * 60 * 1000, Math.round(maxWindowMs * (zoomLevel / 100)));
  const averageStepMs = estimateMetricStepMs(data);
  const requestedOffsetMs = Math.max(0, offset) * averageStepMs;

  const availableRangeMs = Math.max(0, timelineEndMs - earliestTimestamp);
  const maxOffsetMs = Math.max(0, availableRangeMs - visibleWindowMs);
  const safeOffsetMs = Math.min(requestedOffsetMs, maxOffsetMs);

  const endTimestamp = timelineEndMs - safeOffsetMs;
  const startTimestamp = Math.max(earliestTimestamp, endTimestamp - visibleWindowMs);
  const zoomed = data.filter(
    (point) => point.timestamp >= startTimestamp && point.timestamp <= endTimestamp
  );

  if (zoomed.length > 1) return zoomed;

  const fallbackItemsToShow = Math.max(2, Math.ceil((data.length * zoomLevel) / 100));
  return data.slice(Math.max(0, data.length - fallbackItemsToShow));
}

export function formatMetricTick(raw: number | string) {
  const timestamp = Number(raw);
  if (!Number.isFinite(timestamp)) return String(raw);

  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return sameDay
    ? metricTickSameDayFormatter.format(date)
    : metricTickFullFormatter.format(date);
}

export function formatMetricTooltipLabel(raw: number | string) {
  const timestamp = Number(raw);
  if (!Number.isFinite(timestamp)) return String(raw);

  return metricTooltipFormatter.format(new Date(timestamp));
}

export function formatHistoryTimestamp(raw: string) {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function getHistoryLevelClass(level: ServerHistoryEntry['level']) {
  switch (level) {
    case 'error':
      return 'bg-red-500/15 text-red-300 border-red-500/40';
    case 'warning':
      return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40';
    case 'success':
      return 'bg-green-500/15 text-green-300 border-green-500/40';
    default:
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40';
  }
}
