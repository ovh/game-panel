import { startTransition } from 'react';
import {
  extractTimestampedLogLine,
  type LogEntry,
  type ServerHistoryEntry,
  type ServerMetricHistoryPoint,
} from '../../utils/serverRuntime';
import type { GameServer } from '../../types/gameServer';

interface CreateWebSocketMessageHandlerDeps {
  setGameServers: React.Dispatch<React.SetStateAction<GameServer[]>>;
  setServerMetricsHistoryById: React.Dispatch<
    React.SetStateAction<Record<string, ServerMetricHistoryPoint[]>>
  >;
  addServerHistoryEntries: (serverId: string, incoming: ServerHistoryEntry[]) => void;
  suppressReplayAfterClearRef: React.MutableRefObject<Record<string, boolean>>;
  replaceServerLogs: (serverId: string, nextLogs: LogEntry[]) => void;
  handleAddLog: (serverId: string, log: LogEntry) => void;
  consoleReadyRef: React.MutableRefObject<Record<string, boolean | null>>;
  setConsoleReadyByServer: React.Dispatch<React.SetStateAction<Record<string, boolean | null>>>;
  normalizeRealtimeServer: (server: any, existing?: GameServer) => GameServer;
  removeServerFromUi: (serverId: string) => void;
  setInstallServerId: React.Dispatch<React.SetStateAction<number | null>>;
  setInstallProgressPercent: React.Dispatch<React.SetStateAction<number | null>>;
  setInstallStatus: React.Dispatch<React.SetStateAction<string | null>>;
  setInstallError: React.Dispatch<React.SetStateAction<string | null>>;
  setInstalling: React.Dispatch<React.SetStateAction<boolean>>;
  lastInstallProgressLogRef: React.MutableRefObject<Record<number, number>>;
  refreshInstallPermissions: () => Promise<void> | void;
  addCLIMessage: (
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
    server?: string,
    action?: string
  ) => void;
  resolveServerName: (serverId: number | string, fallbackName?: string) => string;
}

export function createWebSocketMessageHandler({
  setGameServers,
  setServerMetricsHistoryById,
  addServerHistoryEntries,
  suppressReplayAfterClearRef,
  replaceServerLogs,
  handleAddLog,
  consoleReadyRef,
  setConsoleReadyByServer,
  normalizeRealtimeServer,
  removeServerFromUi,
  setInstallServerId,
  setInstallProgressPercent,
  setInstallStatus,
  setInstallError,
  setInstalling,
  lastInstallProgressLogRef,
  refreshInstallPermissions,
  addCLIMessage,
  resolveServerName,
}: CreateWebSocketMessageHandlerDeps) {
  return (message: any) => {
    const { type, serverId, logs, lines } = message;

    const parseMetricPercent = (raw: any): number | undefined => {
      if (raw === null || raw === undefined) return undefined;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
      }
      if (typeof raw === 'string') {
        const cleaned = raw.replace('%', '').trim();
        const parsed = Number(cleaned);
        if (Number.isFinite(parsed)) return parsed;
      }
      return undefined;
    };

    const normalizeServerMetrics = (raw: any) => {
      const cpu = parseMetricPercent(
        raw?.cpuUsage ??
          raw?.cpu_usage ??
          raw?.cpu ??
          raw?.cpuPercent ??
          raw?.cpu_percent ??
          raw?.usage?.cpu
      );

      const memory = parseMetricPercent(
        raw?.memoryUsage ??
          raw?.memory_usage ??
          raw?.memory ??
          raw?.memoryPercent ??
          raw?.memory_percent ??
          raw?.ramUsage ??
          raw?.ram_usage ??
          raw?.ram ??
          raw?.ramPercent ??
          raw?.ram_percent ??
          raw?.usage?.memory
      );

      return { cpu, memory };
    };

    const normalizeServerId = (msg: any): string | null => {
      const rawId = msg?.serverId ?? msg?.server_id ?? msg?.id;
      if (rawId === null || rawId === undefined) return null;
      return String(rawId);
    };

    const toEpochMs = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (value > 1e12) return value;
        if (value > 1e9) return value * 1000;
        return null;
      }

      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return parsed;
      }

      return null;
    };

    const clampPercent = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(100, value));
    };

    const toIsoTimestamp = (value: unknown): string => {
      const parsed = toEpochMs(value);
      return new Date(parsed ?? Date.now()).toISOString();
    };

    const normalizeServerMetricPoint = (
      raw: any,
      fallbackTimestamp?: unknown
    ): ServerMetricHistoryPoint | null => {
      const normalized = normalizeServerMetrics(raw);
      if (normalized.cpu === undefined && normalized.memory === undefined) return null;

      const metricTimestamp =
        raw?.timestamp ??
        raw?.date ??
        raw?.datetime ??
        raw?.recorded_at ??
        raw?.created_at ??
        fallbackTimestamp;

      const timestamp = toEpochMs(metricTimestamp) ?? Date.now();

      return {
        timestamp,
        cpuUsage: clampPercent(normalized.cpu ?? 0),
        memoryUsage: clampPercent(normalized.memory ?? 0),
      };
    };

    const metricPointEquals = (
      left: ServerMetricHistoryPoint | null | undefined,
      right: ServerMetricHistoryPoint | null | undefined
    ) =>
      left?.timestamp === right?.timestamp &&
      left?.cpuUsage === right?.cpuUsage &&
      left?.memoryUsage === right?.memoryUsage;

    const normalizeSystemMetric = (raw: any) => {
      if (!raw || typeof raw !== 'object') return raw;

      const cpu = raw.cpu ?? raw.cpu_usage ?? raw.cpuUsage ?? 0;
      const memory = raw.memory ?? raw.memory_usage ?? raw.memoryUsage ?? 0;
      const networkIn = raw.network_in ?? raw.network?.in ?? 0;
      const networkOut = raw.network_out ?? raw.network?.out ?? 0;

      return {
        ...raw,
        cpu,
        memory,
        network_in: networkIn,
        network_out: networkOut,
        network: {
          in: networkIn,
          out: networkOut,
          ...(raw.network || {}),
        },
      };
    };

    const normalizeHistoryEntry = (
      action: any,
      fallbackTimestamp: unknown,
      fallbackId: number
    ): ServerHistoryEntry | null => {
      const rawLevel = typeof action?.level === 'string' ? action.level.toLowerCase() : 'info';
      const level: ServerHistoryEntry['level'] =
        rawLevel === 'error' || rawLevel === 'warning' || rawLevel === 'success'
          ? rawLevel
          : 'info';
      const actor =
        typeof action?.actor_username === 'string' && action.actor_username.trim()
          ? `[${action.actor_username}] `
          : '';
      const parsedId = Number(action?.id);
      const entry: ServerHistoryEntry = {
        id: Number.isFinite(parsedId) ? parsedId : fallbackId,
        timestamp: toIsoTimestamp(action?.timestamp ?? action?.ts ?? fallbackTimestamp),
        level,
        message: `${actor}${action?.message ?? ''}`,
      };

      return entry.message.trim().length > 0 ? entry : null;
    };

    const normalizeLogEntries = (rawLines: unknown[]): LogEntry[] =>
      rawLines
        .map((line, index) => {
          const parsedLine = extractTimestampedLogLine(line);
          return {
            id: Date.now() + index,
            timestamp: parsedLine.timestamp,
            type: 'info' as const,
            message: parsedLine.message,
          };
        })
        .filter((entry) => entry.message.trim().length > 0);

    switch (type) {
      case 'system-metrics:update': {
        const normalizedMetrics = normalizeSystemMetric({
          ...(message.metrics || {}),
          timestamp: message?.timestamp ?? message?.metrics?.timestamp,
        });
        try {
          localStorage.setItem('system_metrics_latest', JSON.stringify(normalizedMetrics));
        } catch {}
        window.dispatchEvent(
          new CustomEvent('system-metrics-update', {
            detail: { type: 'system-metrics', metrics: normalizedMetrics },
          })
        );
        break;
      }

      case 'system-metrics:history': {
        const normalizedHistory = Array.isArray(message.metrics)
          ? message.metrics.map((metric: any) => normalizeSystemMetric(metric))
          : [];
        try {
          localStorage.setItem('system_history_raw', JSON.stringify(normalizedHistory));
        } catch {}

        try {
          const history = normalizedHistory;
          const latest = history[history.length - 1];
          if (latest) {
            localStorage.setItem('system_metrics_latest', JSON.stringify(latest));
          }
        } catch {}

        window.dispatchEvent(
          new CustomEvent('system-metrics-update', {
            detail: { type: 'system-metrics-history', metrics: normalizedHistory },
          })
        );
        break;
      }

      case 'system-metrics': {
        const normalizedMetrics = normalizeSystemMetric(message || {});
        try {
          localStorage.setItem('system_metrics_latest', JSON.stringify(normalizedMetrics));
        } catch {}
        window.dispatchEvent(
          new CustomEvent('system-metrics-update', {
            detail: { type: 'system-metrics', metrics: normalizedMetrics },
          })
        );
        break;
      }

      case 'metrics:update': {
        const targetServerId = normalizeServerId(message) ?? String(serverId);
        const normalized = normalizeServerMetrics(message?.metrics || {});
        const nextPoint = normalizeServerMetricPoint(message?.metrics || {}, message?.timestamp);

        startTransition(() => {
          if (normalized.cpu !== undefined || normalized.memory !== undefined) {
            setGameServers((prev) => {
              let changed = false;

              const next = prev.map((server) => {
                if (server.id !== targetServerId) return server;

                const nextCpuUsage = normalized.cpu ?? server.cpuUsage;
                const nextMemoryUsage = normalized.memory ?? server.memoryUsage;

                if (
                  nextCpuUsage === server.cpuUsage &&
                  nextMemoryUsage === server.memoryUsage
                ) {
                  return server;
                }

                changed = true;
                return {
                  ...server,
                  cpuUsage: nextCpuUsage,
                  memoryUsage: nextMemoryUsage,
                };
              });

              return changed ? next : prev;
            });
          }

          if (nextPoint) {
            setServerMetricsHistoryById((prev) => {
              const current = prev[targetServerId] || [];
              const last = current[current.length - 1];
              let next = current;

              if (last && Math.abs(last.timestamp - nextPoint.timestamp) < 1000) {
                if (metricPointEquals(last, nextPoint)) {
                  return prev;
                }

                next = [...current.slice(0, -1), nextPoint];
              } else if (!metricPointEquals(last, nextPoint)) {
                next = [...current, nextPoint];
              }

              if (next === current) {
                return prev;
              }

              if (next.length > 2000) {
                next = next.slice(-2000);
              }

              return {
                ...prev,
                [targetServerId]: next,
              };
            });
          }
        });
        break;
      }

      case 'metrics:history': {
        const targetServerId = normalizeServerId(message) ?? String(serverId);
        const history = Array.isArray(message.metrics) ? message.metrics : [];
        const normalizedHistory = history
          .map((metric: any) => normalizeServerMetricPoint(metric, metric?.timestamp))
          .filter(
            (point: ServerMetricHistoryPoint | null): point is ServerMetricHistoryPoint =>
              point !== null
          );
        normalizedHistory.sort(
          (a: ServerMetricHistoryPoint, b: ServerMetricHistoryPoint) => a.timestamp - b.timestamp
        );

        if (normalizedHistory.length > 0) {
          startTransition(() => {
            setServerMetricsHistoryById((prev) => {
              const current = prev[targetServerId] || [];
              const next = normalizedHistory.slice(-2000);

              // Keep the richer local history if an incoming history is shorter.
              if (current.length > next.length) {
                return prev;
              }

              if (
                current.length === next.length &&
                current.every((point, index) => metricPointEquals(point, next[index]))
              ) {
                return prev;
              }

              return {
                ...prev,
                [targetServerId]: next,
              };
            });
          });
        }

        const latest =
          normalizedHistory.length > 0 ? normalizedHistory[normalizedHistory.length - 1] : null;
        if (!latest) break;

        startTransition(() => {
          setGameServers((prev) => {
            let changed = false;

            const next = prev.map((server) => {
              if (server.id !== targetServerId) return server;

              if (
                server.cpuUsage === latest.cpuUsage &&
                server.memoryUsage === latest.memoryUsage
              ) {
                return server;
              }

              changed = true;
              return {
                ...server,
                cpuUsage: latest.cpuUsage,
                memoryUsage: latest.memoryUsage,
              };
            });

            return changed ? next : prev;
          });
        });
        break;
      }

      case 'actions:history': {
        const targetServerId =
          normalizeServerId(message) ??
          (serverId === undefined || serverId === null ? null : String(serverId));
        if (!targetServerId) break;

        if (Array.isArray(message.actions)) {
          const entries: ServerHistoryEntry[] = message.actions
            .map((action: any, idx: number) =>
              normalizeHistoryEntry(
                action,
                action?.timestamp ?? message?.timestamp,
                Date.now() + idx
              )
            )
            .filter(
              (entry: ServerHistoryEntry | null): entry is ServerHistoryEntry => entry !== null
            );

          addServerHistoryEntries(targetServerId, entries);
        }
        break;
      }

      case 'logs:history':
      case 'logs:container': {
        const targetServerId =
          normalizeServerId(message) ??
          (serverId === undefined || serverId === null ? null : String(serverId));
        if (!targetServerId) break;

        if (suppressReplayAfterClearRef.current[targetServerId]) {
          break;
        }
        const historyLines = Array.isArray(logs) ? logs : [];
        replaceServerLogs(targetServerId, normalizeLogEntries(historyLines));
        break;
      }

      case 'logs:new':
      case 'logs:container:new': {
        const targetServerId =
          normalizeServerId(message) ??
          (serverId === undefined || serverId === null ? null : String(serverId));
        if (!targetServerId) break;

        if (suppressReplayAfterClearRef.current[targetServerId]) {
          suppressReplayAfterClearRef.current[targetServerId] = false;
        }
        const nextLines = Array.isArray(lines) ? lines : Array.isArray(logs) ? logs : [];
        if (nextLines.length > 0) {
          normalizeLogEntries(nextLines).forEach((entry) => {
            handleAddLog(targetServerId, entry);
          });
        }
        break;
      }

      case 'actions:new': {
        const targetServerId =
          normalizeServerId(message) ??
          (serverId === undefined || serverId === null ? null : String(serverId));
        if (!targetServerId) break;

        if (suppressReplayAfterClearRef.current[targetServerId]) {
          suppressReplayAfterClearRef.current[targetServerId] = false;
        }
        if (message?.action) {
          const nextEntry = normalizeHistoryEntry(
            message.action,
            message?.timestamp ?? message?.ts,
            Date.now()
          );
          if (nextEntry) {
            addServerHistoryEntries(targetServerId, [nextEntry]);
          }
        }
        break;
      }

      case 'console:status': {
        if (serverId === undefined || serverId === null) break;

        const id = String(serverId);
        const ready = Boolean(message.ready);

        consoleReadyRef.current[id] = ready;
        setConsoleReadyByServer((prev) => ({
          ...prev,
          [id]: ready,
        }));

        break;
      }

      case 'servers:subscribed':
        break;

      case 'servers:snapshot': {
        const { servers } = message;
        if (servers && Array.isArray(servers)) {
          setGameServers(servers.map((server: any) => normalizeRealtimeServer(server)));
        }
        break;
      }

      case 'servers:created':
      case 'servers:updated': {
        // Treat created/updated with the same upsert strategy to keep the local list in sync.
        const { server } = message;
        if (server) {
          setGameServers((prev) => {
            const existing = prev.find((s) => s.id === String(server.id));
            if (!existing) {
              return [...prev, normalizeRealtimeServer(server)];
            } else {
              return prev.map((s) =>
                s.id === String(server.id) ? normalizeRealtimeServer(server, s) : s
              );
            }
          });
        }
        break;
      }

      case 'servers:deleted': {
        const { serverId } = message;
        if (serverId) {
          removeServerFromUi(String(serverId));
        }
        break;
      }

      case 'logs:subscribed':
        break;

      case 'install:subscribed':
        break;

      case 'install:progress': {
        const { progress, status, errorMessage } = message;
        setGameServers((prev) =>
          prev.map((s) =>
            s.id === String(serverId)
              ? {
                  ...s,
                  installProgress: typeof progress === 'number' ? progress : s.installProgress,
                  installStatus: status || s.installStatus,
                }
              : s
          )
        );

        setInstallServerId(serverId);
        setInstallProgressPercent(typeof progress === 'number' ? progress : 0);
        setInstallStatus(status || 'pending');

        if (status === 'failed') {
          delete lastInstallProgressLogRef.current[serverId];
          setInstallError(errorMessage || 'Installation failed');
          setInstalling(false);
          addCLIMessage(
            'error',
            `[ERROR] Installation failed for server ${serverId}: ${errorMessage || 'Unknown error'}`
          );
        } else if (status === 'completed') {
          delete lastInstallProgressLogRef.current[serverId];
          setInstallError(null);
          setInstalling(false);
          void refreshInstallPermissions();
          addCLIMessage('success', `[OK] Installation completed for server ${serverId}`);
        } else {
          setInstalling(true);
          const pct = Math.round(progress || 0);
          const prevPct = lastInstallProgressLogRef.current[serverId];
          lastInstallProgressLogRef.current[serverId] = pct;

          if (prevPct === undefined || pct === 0 || pct === 100 || Math.abs(pct - prevPct) >= 10) {
            addCLIMessage(
              'info',
              `[INSTALL] Progress for server ${serverId}: ${pct}%`,
              resolveServerName(serverId),
              'install'
            );
          }
        }
        break;
      }

      default:
        break;
    }
  };
}
