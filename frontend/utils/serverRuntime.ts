import type { GameServerStatus } from '../types/gameServer';

export interface ServerMetricHistoryPoint {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
}

export interface LogEntry {
  id: number;
  timestamp: string;
  displayTime?: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'command' | 'action';
  message: string;
}

export type ServerLogs = Record<string, LogEntry[]>;

export interface ServerHistoryEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

export type ServerHistoryById = Record<string, ServerHistoryEntry[]>;

const LEADING_ISO_TIMESTAMP_PATTERN =
  /^\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+\-]\d{2}:\d{2}))(.*)$/;

const STOPPED_BACKEND_STATUSES = new Set([
  'stopped',
  'stop',
  'exited',
  'dead',
  'offline',
  'error',
]);

const RUNNING_BACKEND_STATUSES = new Set(['running', 'run', 'healthy', 'online', 'up', 'started']);
const CANONICAL_SERVER_STATUSES = new Set<GameServerStatus>([
  'running',
  'stopped',
  'creating',
  'installing',
  'starting',
  'stopping',
  'restarting',
  'unhealthy',
  'failed',
]);
const TRANSITION_SERVER_STATUSES = new Set<GameServerStatus>([
  'starting',
  'stopping',
  'restarting',
]);

const parseIsoTimestampToDate = (rawTimestamp: string): Date | null => {
  const normalized = rawTimestamp.replace(
    /\.(\d{1,9})(Z|[+\-]\d{2}:\d{2})$/,
    (_full, fraction: string, timezone: string) => `.${fraction.slice(0, 3)}${timezone}`
  );
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function mapBackendStatusToUi(status: unknown): GameServerStatus {
  const raw = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!raw) return 'stopped';
  if (CANONICAL_SERVER_STATUSES.has(raw as GameServerStatus)) return raw as GameServerStatus;
  if (STOPPED_BACKEND_STATUSES.has(raw)) return 'stopped';
  if (RUNNING_BACKEND_STATUSES.has(raw)) return 'running';
  return 'stopped';
}

export function isServerCreatingStatus(status: unknown): boolean {
  return mapBackendStatusToUi(status) === 'creating';
}

export function isServerInstallingStatus(status: unknown): boolean {
  return mapBackendStatusToUi(status) === 'installing';
}

export function isServerTransitioningStatus(status: unknown): boolean {
  return TRANSITION_SERVER_STATUSES.has(mapBackendStatusToUi(status));
}

export function isServerUpLike(status: unknown): boolean {
  const ui = mapBackendStatusToUi(status);
  return ui === 'running' || ui === 'unhealthy';
}

export function isServerDownLike(status: unknown): boolean {
  const ui = mapBackendStatusToUi(status);
  return ui === 'stopped' || ui === 'failed';
}

export function formatServerStatusLabel(status: unknown): string {
  switch (mapBackendStatusToUi(status)) {
    case 'running':
      return 'Running';
    case 'stopped':
      return 'Stopped';
    case 'creating':
      return 'Creating';
    case 'installing':
      return 'Installing';
    case 'starting':
      return 'Starting';
    case 'stopping':
      return 'Stopping';
    case 'restarting':
      return 'Restarting';
    case 'unhealthy':
      return 'Unhealthy';
    case 'failed':
      return 'Failed';
    default:
      return 'Stopped';
  }
}

export function formatLogDisplayTime(value: string): string {
  const parsed = new Date(value);
  const date = !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function extractTimestampedLogLine(line: unknown): { timestamp: string; message: string } {
  const rawLine = typeof line === 'string' ? line : String(line ?? '');
  const match = rawLine.match(LEADING_ISO_TIMESTAMP_PATTERN);

  if (!match) {
    return {
      timestamp: new Date().toISOString(),
      message: rawLine,
    };
  }

  const parsedDate = parseIsoTimestampToDate(match[1]);
  const rawMessage = match[2] ?? '';
  const normalizedMessage =
    rawMessage.startsWith(' ') && !rawMessage.startsWith('  ') ? rawMessage.slice(1) : rawMessage;
  return {
    timestamp: (parsedDate ?? new Date()).toISOString(),
    message: normalizedMessage,
  };
}

