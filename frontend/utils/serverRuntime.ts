import type { GameServerStatus } from '../types/gameServer';

export interface ServerMetricHistoryPoint {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface LogEntry {
  id: number;
  timestamp: string;
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

interface ExtractedServerPorts {
  primary: number | null;
  portMappings: {
    tcp: number[];
    udp: number[];
  };
  portLabels: {
    tcp: Record<string, string>;
    udp: Record<string, string>;
  };
}

const LEADING_ISO_TIMESTAMP_PATTERN =
  /^\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+\-]\d{2}:\d{2}))(.*)$/;

const STOPPED_BACKEND_STATUSES = new Set([
  'stopped',
  'stop',
  'unhealthy',
  'exited',
  'dead',
  'offline',
  'error',
  'failed',
]);

const RUNNING_BACKEND_STATUSES = new Set(['running', 'run', 'healthy', 'online', 'up', 'started']);
const CANONICAL_SERVER_STATUSES = new Set<GameServerStatus>([
  'running',
  'stopped',
  'installing',
  'starting',
  'stopping',
  'restarting',
]);
const TRANSITION_SERVER_STATUSES = new Set<GameServerStatus>([
  'installing',
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

export function isServerRunningStatus(status: unknown): boolean {
  return mapBackendStatusToUi(status) === 'running';
}

export function isServerStoppedStatus(status: unknown): boolean {
  return mapBackendStatusToUi(status) === 'stopped';
}

export function isServerTransitioningStatus(status: unknown): boolean {
  return TRANSITION_SERVER_STATUSES.has(mapBackendStatusToUi(status));
}

export function formatServerStatusLabel(status: unknown): string {
  switch (mapBackendStatusToUi(status)) {
    case 'running':
      return 'Running';
    case 'stopped':
      return 'Stopped';
    case 'installing':
      return 'Installing';
    case 'starting':
      return 'Starting';
    case 'stopping':
      return 'Stopping';
    case 'restarting':
      return 'Restarting';
    default:
      return 'Stopped';
  }
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

const normalizeHostPortList = (ports: unknown): number[] => {
  if (!ports) return [];

  const values: number[] = [];

  if (Array.isArray(ports)) {
    ports.forEach((entry) => {
      if (typeof entry === 'number' && Number.isInteger(entry) && entry > 0) {
        values.push(entry);
        return;
      }

      if (entry && typeof entry === 'object') {
        const host = Number((entry as { host?: unknown }).host);
        if (Number.isInteger(host) && host > 0) {
          values.push(host);
        }
      }
    });
  } else if (typeof ports === 'object') {
    Object.entries(ports).forEach(([key, value]) => {
      const keyPort = Number(key);
      if (Number.isInteger(keyPort) && keyPort > 0) {
        values.push(keyPort);
        return;
      }

      if (value && typeof value === 'object') {
        const host = Number((value as { host?: unknown }).host);
        if (Number.isInteger(host) && host > 0) {
          values.push(host);
        }
      }
    });
  }

  return Array.from(new Set(values)).sort((a, b) => a - b);
};

const normalizePortLabels = (labels: unknown): Record<string, string> => {
  if (!labels || typeof labels !== 'object') return {};

  const out: Record<string, string> = {};
  Object.entries(labels as Record<string, unknown>).forEach(([key, value]) => {
    const keyPort = Number(key);
    if (!Number.isInteger(keyPort) || keyPort <= 0) return;
    out[String(keyPort)] = String(value ?? '');
  });

  return out;
};

const isGamePortLabel = (value: unknown): boolean =>
  String(value ?? '')
    .toLowerCase()
    .includes('game');

export function extractServerPorts(
  rawPortMappings: unknown,
  rawPortLabels?: unknown
): ExtractedServerPorts {
  let parsed = rawPortMappings;

  if (typeof rawPortMappings === 'string') {
    try {
      parsed = JSON.parse(rawPortMappings);
    } catch {
      parsed = null;
    }
  }

  let parsedLabels = rawPortLabels;
  if (typeof rawPortLabels === 'string') {
    try {
      parsedLabels = JSON.parse(rawPortLabels);
    } catch {
      parsedLabels = null;
    }
  }

  const tcp = normalizeHostPortList((parsed as { tcp?: unknown } | null)?.tcp);
  const udp = normalizeHostPortList((parsed as { udp?: unknown } | null)?.udp);
  const tcpLabels = normalizePortLabels((parsedLabels as { tcp?: unknown } | null)?.tcp);
  const udpLabels = normalizePortLabels((parsedLabels as { udp?: unknown } | null)?.udp);

  const primaryGameTcp = tcp.find((port) => isGamePortLabel(tcpLabels[String(port)])) ?? null;
  const primaryGameUdp = udp.find((port) => isGamePortLabel(udpLabels[String(port)])) ?? null;
  const primary = primaryGameTcp || primaryGameUdp || tcp[0] || udp[0] || null;

  return {
    primary,
    portMappings: { tcp, udp },
    portLabels: { tcp: tcpLabels, udp: udpLabels },
  };
}
