import { startTransition } from 'react';
import {
  extractTimestampedLogLine,
  formatLogDisplayTime,
  type LogEntry,
  type ServerHistoryEntry,
  type ServerMetricHistoryPoint,
} from '../../utils/serverRuntime';
import type { GameServer, InstallInteraction, InstallStep, ServerPlayers } from '../../types/gameServer';
import { nextId } from '../../utils/uid';

// Latest fleet sample per server id, kept so a tick that lands before the server list can
// still be applied once the rows exist.
export interface FleetMetricValues {
  cpu?: number;
  memory?: number;
  disk?: number;
  networkIn?: number;
  networkOut?: number;
}

interface CreateWebSocketMessageHandlerDeps {
  setGameServers: React.Dispatch<React.SetStateAction<GameServer[]>>;
  fleetMetricsRef: React.MutableRefObject<Record<string, FleetMetricValues>>;
  setServerMetricsHistoryById: React.Dispatch<
    React.SetStateAction<Record<string, ServerMetricHistoryPoint[]>>
  >;
  setServersPlayersById: React.Dispatch<React.SetStateAction<Record<string, ServerPlayers>>>;
  addServerHistoryEntries: (serverId: string, incoming: ServerHistoryEntry[]) => void;
  suppressReplayAfterClearRef: React.MutableRefObject<Record<string, boolean>>;
  replaceServerLogs: (serverId: string, nextLogs: LogEntry[]) => void;
  handleAddLog: (serverId: string, log: LogEntry) => void;
  normalizeRealtimeServer: (server: any, existing?: GameServer) => GameServer;
  removeServerFromUi: (serverId: string) => void;
  setInstallServerId: React.Dispatch<React.SetStateAction<number | null>>;
  setInstallProgressPercent: React.Dispatch<React.SetStateAction<number | null>>;
  setInstallStatus: React.Dispatch<React.SetStateAction<string | null>>;
  setInstallError: React.Dispatch<React.SetStateAction<string | null>>;
  setInstalling: React.Dispatch<React.SetStateAction<boolean>>;
  setInstallInteraction: React.Dispatch<React.SetStateAction<InstallInteraction | null>>;
  setInstallPlan: React.Dispatch<React.SetStateAction<InstallStep[]>>;
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
  fleetMetricsRef,
  setServerMetricsHistoryById,
  setServersPlayersById,
  addServerHistoryEntries,
  suppressReplayAfterClearRef,
  replaceServerLogs,
  handleAddLog,
  normalizeRealtimeServer,
  removeServerFromUi,
  setInstallServerId,
  setInstallProgressPercent,
  setInstallStatus,
  setInstallError,
  setInstalling,
  setInstallInteraction,
  setInstallPlan,
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

      const disk = parseMetricPercent(
        raw?.diskUsage ?? raw?.disk_usage ?? raw?.disk
      );

      const networkIn = Math.max(0, Number(raw?.network?.in ?? raw?.network_in ?? 0) || 0);
      const networkOut = Math.max(0, Number(raw?.network?.out ?? raw?.network_out ?? 0) || 0);

      return { cpu, memory, disk, networkIn, networkOut };
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
        diskUsage: clampPercent(normalized.disk ?? 0),
        networkIn: Math.max(0, normalized.networkIn ?? 0),
        networkOut: Math.max(0, normalized.networkOut ?? 0),
      };
    };

    const metricPointEquals = (
      left: ServerMetricHistoryPoint | null | undefined,
      right: ServerMetricHistoryPoint | null | undefined
    ) =>
      left?.timestamp === right?.timestamp &&
      left?.cpuUsage === right?.cpuUsage &&
      left?.memoryUsage === right?.memoryUsage &&
      left?.diskUsage === right?.diskUsage &&
      left?.networkIn === right?.networkIn &&
      left?.networkOut === right?.networkOut;

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
        typeof action?.actorUsername === 'string' && action.actorUsername.trim()
          ? `[${action.actorUsername}] `
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
        .map((line) => {
          const parsedLine = extractTimestampedLogLine(line);
          return {
            id: nextId(),
            timestamp: parsedLine.timestamp,
            displayTime: formatLogDisplayTime(parsedLine.timestamp),
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

      case 'servers-metrics:subscribed':
        break;

      case 'servers-metrics:update': {
        // The array is the whole fleet state: a server missing from it is not being measured
        // right now (stopped, installing, container silent), so its cells must clear rather
        // than keep showing a stale percentage as if it were live.
        const entries = Array.isArray(message.metrics) ? message.metrics : [];
        const metricsByServerId = new Map<string, ReturnType<typeof normalizeServerMetrics>>();
        const pointByServerId = new Map<string, ServerMetricHistoryPoint>();

        const fleetSnapshot: Record<string, FleetMetricValues> = {};

        for (const entry of entries) {
          const entryServerId = normalizeServerId(entry);
          if (!entryServerId) continue;
          const measured = normalizeServerMetrics(entry);
          metricsByServerId.set(entryServerId, measured);
          fleetSnapshot[entryServerId] = {
            cpu: measured.cpu,
            memory: measured.memory,
            disk: measured.disk,
            networkIn: measured.networkIn,
            networkOut: measured.networkOut,
          };
          const point = normalizeServerMetricPoint(entry, message?.timestamp);
          if (point) pointByServerId.set(entryServerId, point);
        }

        // The metrics reply comes straight from a cache while the server list needs a query
        // per server, so a tick regularly wins the race and would be dropped for want of
        // rows to apply it to.
        fleetMetricsRef.current = fleetSnapshot;

        startTransition(() => {
          setGameServers((prev) => {
            let changed = false;

            const next = prev.map((server) => {
              const measured = metricsByServerId.get(server.id);
              const nextCpuUsage = measured?.cpu;
              const nextMemoryUsage = measured?.memory;
              // Disk is polled far less often than the rest, so an entry without it means
              // "not remeasured", not "unknown" — only an absent server clears it.
              const nextDiskUsage = measured ? measured.disk ?? server.diskUsage : undefined;
              const nextNetworkIn = measured?.networkIn;
              const nextNetworkOut = measured?.networkOut;

              if (
                nextCpuUsage === server.cpuUsage &&
                nextMemoryUsage === server.memoryUsage &&
                nextDiskUsage === server.diskUsage &&
                nextNetworkIn === server.networkIn &&
                nextNetworkOut === server.networkOut
              ) {
                return server;
              }

              changed = true;
              return {
                ...server,
                cpuUsage: nextCpuUsage,
                memoryUsage: nextMemoryUsage,
                diskUsage: nextDiskUsage,
                networkIn: nextNetworkIn,
                networkOut: nextNetworkOut,
              };
            });

            return changed ? next : prev;
          });

          // Only servers whose history was already pulled — a graph is or was open — keep
          // accumulating, so the fleet ticks never build history nobody asked for.
          setServerMetricsHistoryById((prev) => {
            let changed = false;
            const next = { ...prev };

            for (const [historyServerId, current] of Object.entries(prev)) {
              const point = pointByServerId.get(historyServerId);
              if (!point) continue;

              const last = current[current.length - 1];
              let series = current;

              if (last && Math.abs(last.timestamp - point.timestamp) < 1000) {
                if (metricPointEquals(last, point)) continue;
                series = [...current.slice(0, -1), point];
              } else if (!metricPointEquals(last, point)) {
                series = [...current, point];
              }

              if (series === current) continue;
              next[historyServerId] = series.length > 2000 ? series.slice(-2000) : series;
              changed = true;
            }

            return changed ? next : prev;
          });
        });
        break;
      }

      case 'servers-players:subscribed':
        break;

      case 'servers-players:update': {
        // The array is the whole fleet state: replace wholesale. A server absent from it has
        // nothing to report, so it must clear rather than keep a stale count. Every field is
        // independently nullable — a missing field means "not available", never zero.
        const entries = Array.isArray(message.players) ? message.players : [];
        const next: Record<string, ServerPlayers> = {};

        for (const entry of entries) {
          const entryServerId = normalizeServerId(entry);
          if (!entryServerId) continue;
          const online = typeof entry?.online === 'number' && Number.isFinite(entry.online) ? entry.online : null;
          const max = typeof entry?.max === 'number' && Number.isFinite(entry.max) ? entry.max : null;
          const names = Array.isArray(entry?.names) ? entry.names.map((name: unknown) => String(name)) : null;
          next[entryServerId] = { online, max, names };
        }

        startTransition(() => setServersPlayersById(next));
        break;
      }

      case 'actions:history': {
        const targetServerId =
          normalizeServerId(message) ??
          (serverId === undefined || serverId === null ? null : String(serverId));
        if (!targetServerId) break;

        if (Array.isArray(message.actions)) {
          const entries: ServerHistoryEntry[] = message.actions
            .map((action: any) =>
              normalizeHistoryEntry(
                action,
                action?.timestamp ?? message?.timestamp,
                nextId()
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
            nextId()
          );
          if (nextEntry) {
            addServerHistoryEntries(targetServerId, [nextEntry]);
          }
        }
        break;
      }

      case 'servers:subscribed':
        break;

      case 'servers:snapshot': {
        const { servers } = message;
        if (servers && Array.isArray(servers)) {
          const fleet = fleetMetricsRef.current;
          setGameServers(
            servers.map((server: any) => {
              const normalizedServer = normalizeRealtimeServer(server);
              const measured = fleet[normalizedServer.id];
              return measured
                ? {
                    ...normalizedServer,
                    cpuUsage: measured.cpu,
                    memoryUsage: measured.memory,
                    diskUsage: measured.disk,
                    networkIn: measured.networkIn,
                    networkOut: measured.networkOut,
                  }
                : normalizedServer;
            })
          );
        }
        break;
      }

      case 'servers:created':
      case 'servers:updated': {
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

      case 'install:plan': {
        setInstallPlan(Array.isArray(message.steps) ? message.steps : []);
        break;
      }

      case 'install:interaction': {
        const interaction = message as InstallInteraction;
        if (interaction.status === 'pending') {
          setInstallInteraction(interaction);
        } else {
          setInstallInteraction((prev) => (prev?.id === interaction.id ? null : prev));
        }
        break;
      }

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
          setInstallInteraction(null);
          setInstallPlan([]);
          addCLIMessage(
            'error',
            `[ERROR] Installation failed: ${errorMessage || 'Unknown error'}`,
            resolveServerName(serverId),
            'install'
          );
        } else if (status === 'completed') {
          delete lastInstallProgressLogRef.current[serverId];
          setInstallError(null);
          setInstalling(false);
          setInstallInteraction(null);
          setInstallPlan([]);
          void refreshInstallPermissions();
          addCLIMessage('success', `[OK] Installation completed`, resolveServerName(serverId), 'install');
        } else {
          setInstalling(true);
          const pct = Math.round(progress || 0);
          const prevPct = lastInstallProgressLogRef.current[serverId];
          lastInstallProgressLogRef.current[serverId] = pct;

          if (prevPct === undefined || pct === 0 || pct === 100 || Math.abs(pct - prevPct) >= 10) {
            addCLIMessage(
              'info',
              `[INSTALL] Progress: ${pct}%`,
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
