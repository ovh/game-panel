import type { GameServer, GameServerStatus } from '../types/gameServer';
import { lazy, Suspense, useDeferredValue, useState, useMemo, useEffect, useRef } from 'react';
import { ServerSettingsModal } from './ServerSettingsModal';
import { ConfirmationModal } from './ConfirmationModal';
import type { AuthUser } from '../utils/permissions';
import { apiClient, PUBLIC_CONNECTION_HOST } from '../utils/api';
import {
  isServerRunningStatus,
  type ServerHistoryEntry,
  type ServerMetricHistoryPoint,
} from '../utils/serverRuntime';
// Lazily loaded: the metric-history dialog pulls in recharts. Deferred until the user
// first opens a connection/metric/history dialog, keeping recharts off initial load.
const GameServersTableDialogs = lazy(() =>
  import('./gameServersTable/GameServersTableDialogs').then((m) => ({
    default: m.GameServersTableDialogs,
  }))
);
import { GameServersMobileList } from './gameServersTable/GameServersMobileList';
import { GameServersDesktopTable } from './gameServersTable/GameServersDesktopTable';
import { ODS_CHART_THEME } from './charts/theme';
import {
  type MetricType,
  type SortField,
  type SortOrder,
  METRICS_HISTORY_REQUEST_LIMIT,
  getMetricZoomedData,
} from './gameServersTable/utils';

interface GameServersTableProps {
  servers: GameServer[];
  metricsHistoryByServer?: Record<string, ServerMetricHistoryPoint[]>;
  historyByServer?: Record<string, ServerHistoryEntry[]>;
  gameNamesByKey: Record<string, string>;
  currentUser?: AuthUser | null;
  permissionsByServer?: Record<string, string[]>;
  onDelete: (id: string) => void;
  onAction: (serverId: string, serverName: string, action: string) => void;
  onRename: (id: string, newName: string) => Promise<void> | void;
  onRefresh: () => void;
  onStartAll: () => void;
  onStopAll: () => void;
  canInstall?: boolean;
  onOpenInstallModal?: () => void;
}

interface ConnectionPortRow {
  protocol: 'TCP' | 'UDP';
  hostPort: number;
  name: string;
}

export function GameServersTable({
  servers,
  metricsHistoryByServer,
  historyByServer,
  gameNamesByKey,
  currentUser,
  permissionsByServer,
  onDelete,
  onAction,
  onRename,
  onStartAll,
  onStopAll,
  canInstall = false,
  onOpenInstallModal,
}: GameServersTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<GameServer | null>(null);

  const [confirmAction, setConfirmAction] = useState<{
    show: boolean;
    serverId: string;
    serverName: string;
    action: 'start' | 'stop' | 'restart' | 'stopAll' | 'startAll' | 'delete';
  }>({ show: false, serverId: '', serverName: '', action: 'start' });

  const [nameFilter] = useState('');
  const [gameFilter] = useState('');
  const [statusFilter] = useState<'ALL' | GameServerStatus>('ALL');

  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [metricModal, setMetricModal] = useState<{
    isOpen: boolean;
    serverId: string;
    metric: MetricType;
  }>({ isOpen: false, serverId: '', metric: 'cpu' });

  const VALID_METRICS: MetricType[] = ['cpu', 'memory', 'disk', 'network'];
  const [visibleMetrics, setVisibleMetrics] = useState<MetricType[]>(() => {
    try {
      const stored = localStorage.getItem('gp_visible_metrics');
      if (stored) {
        const parsed = JSON.parse(stored) as unknown[];
        const valid = parsed.filter((m): m is MetricType => VALID_METRICS.includes(m as MetricType));
        return valid.length > 0 ? valid : ['cpu', 'memory'];
      }
    } catch { /* ignore */ }
    return ['cpu', 'memory'];
  });

  useEffect(() => {
    localStorage.setItem('gp_visible_metrics', JSON.stringify(visibleMetrics));
  }, [visibleMetrics]);

  const toggleMetric = (metric: MetricType) => {
    setVisibleMetrics((prev) => {
      if (prev.includes(metric) && prev.length === 1) return prev;
      return prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric];
    });
  };
  const [historyModal, setHistoryModal] = useState<{
    isOpen: boolean;
    serverId: string;
  }>({ isOpen: false, serverId: '' });
  const [metricZoom, setMetricZoom] = useState(100);
  const [metricOffset, setMetricOffset] = useState(0);
  const [metricDragging, setMetricDragging] = useState(false);
  const [metricDragStart, setMetricDragStart] = useState(0);
  const [connectionModalServerId, setConnectionModalServerId] = useState<string | null>(null);
  const [connectionCopyFeedback, setConnectionCopyFeedback] = useState<{
    address: string;
    status: 'success' | 'error';
  } | null>(null);
  const connectionCopyTimerRef = useRef<number | null>(null);

  const handleOpenSettings = (server: GameServer) => {
    setSelectedServer(server);
    setSettingsModalOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsModalOpen(false);
    setSelectedServer(null);
  };

  const handleStartEdit = (server: GameServer) => {
    setEditingId(server.id);
    setEditValue(server.name);
  };

  const handleSaveEdit = (id: string) => {
    if (editValue.trim()) {
      onRename(id, editValue.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Precompute the human-readable game label once per server (parsing provider metadata
  // at most once each) so the sort/filter comparators below are cheap O(1) lookups
  // instead of re-running JSON.parse on every comparison during a sort.
  const gameLabelById = useMemo(() => {
    const map = new Map<GameServer['id'], string>();
    servers.forEach((server) => {
      // Prefer the human-readable game name carried in provider metadata
      // (e.g. LinuxGSM exposes "gamename" while server.game is only the shortname).
      let label = gameNamesByKey[server.game] || server.game;
      if (server.providerMetadataJson) {
        try {
          const meta = JSON.parse(server.providerMetadataJson);
          if (typeof meta?.gamename === 'string' && meta.gamename.trim()) {
            label = meta.gamename;
          }
        } catch {
          // Malformed metadata: keep the catalog/key fallback.
        }
      }
      map.set(server.id, label);
    });
    return map;
  }, [servers, gameNamesByKey]);

  const getGameLabel = (server: GameServer) =>
    gameLabelById.get(server.id) ?? (gameNamesByKey[server.game] || server.game);

  const openMetricModal = (server: GameServer, metric: MetricType) => {
    if (!isServerRunningStatus(server.status)) return;
    setMetricModal({ isOpen: true, serverId: server.id, metric });
    setMetricZoom(100);
    setMetricOffset(0);
    setMetricDragging(false);
    setMetricDragStart(0);
    apiClient.subscribeMetrics(Number(server.id), METRICS_HISTORY_REQUEST_LIMIT);
  };

  const closeMetricModal = () => {
    setMetricModal({ isOpen: false, serverId: '', metric: 'cpu' });
    setMetricZoom(100);
    setMetricOffset(0);
    setMetricDragging(false);
  };

  const openHistoryModal = (server: GameServer, canReadLogs: boolean) => {
    if (!canReadLogs) return;
    setHistoryModal({ isOpen: true, serverId: server.id });
  };

  const closeHistoryModal = () => {
    setHistoryModal({ isOpen: false, serverId: '' });
  };

  const getConnectionPortRows = (server: GameServer): ConnectionPortRow[] => {
    const rows: ConnectionPortRow[] = [];
    const seen = new Set<string>();
    const tcpLabels = server.portLabels?.tcp ?? {};
    const udpLabels = server.portLabels?.udp ?? {};

    (server.portMappings?.tcp ?? []).forEach((hostPort) => {
      const normalizedPort = Number(hostPort);
      if (!Number.isInteger(normalizedPort) || normalizedPort <= 0) return;
      const key = `tcp:${normalizedPort}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        protocol: 'TCP',
        hostPort: normalizedPort,
        name: String(tcpLabels[String(normalizedPort)] ?? ''),
      });
    });

    (server.portMappings?.udp ?? []).forEach((hostPort) => {
      const normalizedPort = Number(hostPort);
      if (!Number.isInteger(normalizedPort) || normalizedPort <= 0) return;
      const key = `udp:${normalizedPort}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        protocol: 'UDP',
        hostPort: normalizedPort,
        name: String(udpLabels[String(normalizedPort)] ?? ''),
      });
    });

    if (rows.length === 0 && server.port && Number.isInteger(Number(server.port))) {
      rows.push({
        protocol: 'TCP',
        hostPort: Number(server.port),
        name: 'game',
      });
    }

    return rows.sort((a, b) => a.hostPort - b.hostPort || a.protocol.localeCompare(b.protocol));
  };

  const openConnectionModal = (server: GameServer) => {
    if (!server.port && getConnectionPortRows(server).length === 0) return;
    setConnectionModalServerId(server.id);
  };

  const closeConnectionModal = () => {
    setConnectionModalServerId(null);
  };

  const getConnectionAddress = (port: number) => {
    const normalizedPort = Number(port);
    if (!Number.isInteger(normalizedPort) || normalizedPort <= 0) return null;
    return `${PUBLIC_CONNECTION_HOST}:${normalizedPort}`;
  };

  const getConnectionCopyState = (port: number): 'idle' | 'success' | 'error' => {
    const address = getConnectionAddress(port);
    if (!address) return 'idle';
    if (connectionCopyFeedback?.address !== address) return 'idle';
    return connectionCopyFeedback.status;
  };

  const copyConnectionAddress = async (port: number) => {
    const address = getConnectionAddress(port);
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      setConnectionCopyFeedback({ address, status: 'success' });
    } catch {
      setConnectionCopyFeedback({ address, status: 'error' });
    }

    if (connectionCopyTimerRef.current !== null) {
      window.clearTimeout(connectionCopyTimerRef.current);
    }

    connectionCopyTimerRef.current = window.setTimeout(() => {
      setConnectionCopyFeedback((current) => (current?.address === address ? null : current));
      connectionCopyTimerRef.current = null;
    }, 2000);
  };

  const changeMetricType = (type: MetricType) => {
    setMetricModal((prev) => ({ ...prev, metric: type }));
  };


  useEffect(() => {
    if (!historyModal.isOpen || !historyModal.serverId) return;

    const targetServerId = Number(historyModal.serverId);
    if (!Number.isFinite(targetServerId)) return;

    apiClient.subscribeActions(targetServerId, 200);

    return () => {
      apiClient.unsubscribeActions(targetServerId);
    };
  }, [historyModal.isOpen, historyModal.serverId]);

  useEffect(() => {
    return () => {
      if (connectionCopyTimerRef.current !== null) {
        window.clearTimeout(connectionCopyTimerRef.current);
      }
    };
  }, []);

  const filteredAndSortedServers = useMemo(() => {
    let result = [...servers];

    if (nameFilter) {
      result = result.filter((server) =>
        server.name.toLowerCase().includes(nameFilter.toLowerCase())
      );
    }

    if (gameFilter) {
      const filterValue = gameFilter.toLowerCase();
      result = result.filter((server) => {
        const label = getGameLabel(server).toLowerCase();
        return label.includes(filterValue) || server.game.toLowerCase().includes(filterValue);
      });
    }

    if (statusFilter !== 'ALL') {
      result = result.filter((server) => server.status === statusFilter);
    }

    if (sortField) {
      result.sort((a, b) => {
        let aValue = a[sortField];
        let bValue = b[sortField];

        if (sortField === 'game') {
          aValue = getGameLabel(a);
          bValue = getGameLabel(b);
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
          return sortOrder === 'asc' ? comparison : -comparison;
        }

        return 0;
      });
    }

    return result;
  }, [servers, nameFilter, gameFilter, statusFilter, sortField, sortOrder, gameNamesByKey]);

  const selectedMetricServer = useMemo(
    () => servers.find((server) => server.id === metricModal.serverId) ?? null,
    [servers, metricModal.serverId]
  );
  const liveSelectedServer = useMemo(() => {
    if (!selectedServer) return null;
    return servers.find((server) => server.id === selectedServer.id) ?? selectedServer;
  }, [servers, selectedServer]);

  const selectedHistoryServer = useMemo(
    () => servers.find((server) => server.id === historyModal.serverId) ?? null,
    [servers, historyModal.serverId]
  );

  const selectedConnectionServer = useMemo(
    () => servers.find((server) => server.id === connectionModalServerId) ?? null,
    [servers, connectionModalServerId]
  );

  const connectionModalRows = useMemo(
    () => (selectedConnectionServer ? getConnectionPortRows(selectedConnectionServer) : []),
    [selectedConnectionServer]
  );

  const historyModalEntries = useMemo(() => {
    if (!selectedHistoryServer) return [];
    const source = historyByServer?.[selectedHistoryServer.id] ?? [];
    return [...source].sort((a, b) => {
      const aTs = Date.parse(a.timestamp);
      const bTs = Date.parse(b.timestamp);
      const safeATs = Number.isNaN(aTs) ? 0 : aTs;
      const safeBTs = Number.isNaN(bTs) ? 0 : bTs;
      if (safeATs !== safeBTs) return safeBTs - safeATs;
      return b.id - a.id;
    });
  }, [historyByServer, selectedHistoryServer]);

  const metricModalAllData = useMemo(() => {
    if (!selectedMetricServer || metricModal.metric === 'network') return [];

    const source = metricsHistoryByServer?.[selectedMetricServer.id] ?? [];
    const next = [...source];

    const latestValue =
      metricModal.metric === 'cpu'
        ? selectedMetricServer.cpuUsage
        : metricModal.metric === 'memory'
          ? selectedMetricServer.memoryUsage
          : selectedMetricServer.diskUsage;

    // Disk is cached between 2-min polls — don't inject a synthetic live point for it
    if (metricModal.metric !== 'disk' && Number.isFinite(latestValue)) {
      const last = next[next.length - 1];
      const now = Date.now();
      if (!last || now - last.timestamp > 15000) {
        next.push({
          timestamp: now,
          cpuUsage: selectedMetricServer.cpuUsage ?? 0,
          memoryUsage: selectedMetricServer.memoryUsage ?? 0,
          diskUsage: selectedMetricServer.diskUsage ?? 0,
          networkIn: selectedMetricServer.networkIn ?? 0,
          networkOut: selectedMetricServer.networkOut ?? 0,
        });
      }
    }

    return next.map((point) => ({
      timestamp: point.timestamp,
      value:
        metricModal.metric === 'cpu'
          ? point.cpuUsage
          : metricModal.metric === 'memory'
            ? point.memoryUsage
            : point.diskUsage,
    }));
  }, [metricsHistoryByServer, metricModal.metric, selectedMetricServer]);

  const metricNetworkAllData = useMemo(() => {
    if (!selectedMetricServer || metricModal.metric !== 'network') return [];

    const source = metricsHistoryByServer?.[selectedMetricServer.id] ?? [];
    const next = [...source];

    if (Number.isFinite(selectedMetricServer.networkIn)) {
      const last = next[next.length - 1];
      const now = Date.now();
      if (!last || now - last.timestamp > 15000) {
        next.push({
          timestamp: now,
          cpuUsage: selectedMetricServer.cpuUsage ?? 0,
          memoryUsage: selectedMetricServer.memoryUsage ?? 0,
          diskUsage: selectedMetricServer.diskUsage ?? 0,
          networkIn: selectedMetricServer.networkIn ?? 0,
          networkOut: selectedMetricServer.networkOut ?? 0,
        });
      }
    }

    return next.map((point) => ({
      timestamp: point.timestamp,
      networkIn: point.networkIn,
      networkOut: point.networkOut,
    }));
  }, [metricsHistoryByServer, metricModal.metric, selectedMetricServer]);

  const deferredMetricModalAllData = useDeferredValue(metricModalAllData);
  const deferredMetricNetworkAllData = useDeferredValue(metricNetworkAllData);

  const metricModalChartData = useMemo(
    () => getMetricZoomedData(deferredMetricModalAllData, metricZoom, metricOffset),
    [deferredMetricModalAllData, metricZoom, metricOffset]
  );

  const metricNetworkChartData = useMemo(
    () => getMetricZoomedData(deferredMetricNetworkAllData, metricZoom, metricOffset),
    [deferredMetricNetworkAllData, metricZoom, metricOffset]
  );

  const handleMetricMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setMetricDragging(true);
    setMetricDragStart(e.clientX);
  };

  const handleMetricMouseMove = (e: React.MouseEvent) => {
    if (!metricDragging) return;

    const delta = e.clientX - metricDragStart;
    const sensitivity = 2;
    const offsetDelta = Math.floor(delta / sensitivity);

    if (Math.abs(offsetDelta) < 1) return;

    setMetricDragStart(e.clientX);
    setMetricOffset((prev) => Math.max(0, prev + offsetDelta));
  };

  const handleMetricMouseUp = () => {
    setMetricDragging(false);
  };

  const handleMetricWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const zoomDelta = event.deltaY > 0 ? 10 : -10;
    setMetricZoom((currentZoom) => Math.max(10, Math.min(100, currentZoom + zoomDelta)));
  };

  const cardBg = 'bg-gp-surface-card';
  const cardBorder = 'border-gray-800';
  const cardShadow = 'shadow-[0_4px_24px_rgba(2,6,23,0.55),0_1px_4px_rgba(2,6,23,0.3)]';
  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-300';
  const textTertiary = 'text-gray-400';
  const inputBg = 'bg-gp-surface-elevated';
  const inputBorder = 'border-gray-700';
  const borderColor = 'border-gray-700';
  const rowBorder = 'border-gray-800';
  const metricChartColor =
    metricModal.metric === 'cpu'
      ? ODS_CHART_THEME.cpu
      : metricModal.metric === 'memory'
        ? ODS_CHART_THEME.ram
        : ODS_CHART_THEME.disk;
  const metricLabel =
    metricModal.metric === 'cpu'
      ? 'CPU'
      : metricModal.metric === 'memory'
        ? 'Memory'
        : metricModal.metric === 'disk'
          ? 'Disk'
          : 'Network';
  const canOpenInstallModal = Boolean(onOpenInstallModal) && canInstall;

  // Mount the (lazy, recharts-bearing) dialogs only once a dialog is first opened, then
  // keep them mounted so close transitions still play. Guarded so it flips at most once.
  const anyDialogOpen =
    metricModal.isOpen || historyModal.isOpen || Boolean(selectedConnectionServer);
  const [dialogsMounted, setDialogsMounted] = useState(false);
  if (anyDialogOpen && !dialogsMounted) setDialogsMounted(true);

  return (
    <div
      className={`${cardBg} rounded-lg border ${cardBorder} ${cardShadow} mb-6 px-3 pt-3 pb-3 md:px-6 md:pt-6 lg:pb-0`}
    >
      <div className="mb-3 md:mb-4">
        <h2 className={`text-lg md:text-xl ${textPrimary}`}>Game Servers</h2>
      </div>

      <GameServersDesktopTable
        filteredAndSortedServers={filteredAndSortedServers}
        currentUser={currentUser}
        permissionsByServer={permissionsByServer}
        borderColor={borderColor}
        rowBorder={rowBorder}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        textTertiary={textTertiary}
        inputBg={inputBg}
        inputBorder={inputBorder}
        editingId={editingId}
        editValue={editValue}
        setEditValue={setEditValue}
        handleSaveEdit={handleSaveEdit}
        handleCancelEdit={handleCancelEdit}
        handleStartEdit={handleStartEdit}
        getGameLabel={getGameLabel}
        openConnectionModal={openConnectionModal}
        openHistoryModal={openHistoryModal}
        openMetricModal={openMetricModal}
        visibleMetrics={visibleMetrics}
        onToggleMetric={toggleMetric}
        copyConnectionAddress={copyConnectionAddress}
        getConnectionCopyState={getConnectionCopyState}
        setConfirmAction={setConfirmAction}
        handleOpenSettings={handleOpenSettings}
        onAction={onAction}
        canOpenInstallModal={canOpenInstallModal}
        canInstall={canInstall}
        onOpenInstallModal={onOpenInstallModal}
        publicConnectionHost={PUBLIC_CONNECTION_HOST}
        sortField={sortField}
        sortOrder={sortOrder}
        handleSort={handleSort}
      />

      <GameServersMobileList
        filteredAndSortedServers={filteredAndSortedServers}
        currentUser={currentUser}
        permissionsByServer={permissionsByServer}
        rowBorder={rowBorder}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        textTertiary={textTertiary}
        inputBg={inputBg}
        inputBorder={inputBorder}
        editingId={editingId}
        editValue={editValue}
        setEditValue={setEditValue}
        handleSaveEdit={handleSaveEdit}
        handleCancelEdit={handleCancelEdit}
        handleStartEdit={handleStartEdit}
        getGameLabel={getGameLabel}
        openConnectionModal={openConnectionModal}
        openHistoryModal={openHistoryModal}
        openMetricModal={openMetricModal}
        onConfirmAction={(serverId, serverName, action) =>
          setConfirmAction({ show: true, serverId, serverName, action })
        }
        handleOpenSettings={handleOpenSettings}
        onAction={onAction}
        canOpenInstallModal={canOpenInstallModal}
        canInstall={canInstall}
        onOpenInstallModal={onOpenInstallModal}
      />

      {dialogsMounted && (
      <Suspense fallback={null}>
      <GameServersTableDialogs
        cardBg={cardBg}
        cardBorder={cardBorder}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        textTertiary={textTertiary}
        rowBorder={rowBorder}
        selectedConnectionServer={selectedConnectionServer}
        connectionModalRows={connectionModalRows}
        closeConnectionModal={closeConnectionModal}
        copyConnectionAddress={copyConnectionAddress}
        getConnectionCopyState={getConnectionCopyState}
        metricModalOpen={metricModal.isOpen}
        selectedMetricServer={selectedMetricServer}
        metricType={metricModal.metric}
        onChangeMetricType={changeMetricType}
        metricLabel={metricLabel}
        metricModalChartData={metricModalChartData}
        metricNetworkChartData={metricNetworkChartData}
        metricChartColor={metricChartColor}
        metricDragging={metricDragging}
        closeMetricModal={closeMetricModal}
        handleMetricMouseDown={handleMetricMouseDown}
        handleMetricMouseMove={handleMetricMouseMove}
        handleMetricMouseUp={handleMetricMouseUp}
        handleMetricWheel={handleMetricWheel}
        getGameLabel={getGameLabel}
        historyModalOpen={historyModal.isOpen}
        selectedHistoryServer={selectedHistoryServer}
        historyModalEntries={historyModalEntries}
        closeHistoryModal={closeHistoryModal}
      />
      </Suspense>
      )}

      <ServerSettingsModal
        isOpen={settingsModalOpen}
        onClose={handleCloseSettings}
        serverName={liveSelectedServer?.name || ''}
        serverGame={liveSelectedServer?.game || ''}
        serverProvider={liveSelectedServer?.provider}
        serverProviderMetadataJson={liveSelectedServer?.providerMetadataJson}
        serverStatus={liveSelectedServer?.status || null}
        serverId={liveSelectedServer ? Number(liveSelectedServer.id) : null}
        currentUser={currentUser}
        serverPermissions={liveSelectedServer ? permissionsByServer?.[liveSelectedServer.id] || [] : []}
      />

      <ConfirmationModal
        isOpen={confirmAction.show}
        onClose={() =>
          setConfirmAction({ show: false, serverId: '', serverName: '', action: 'start' })
        }
        onConfirm={() => {
          if (confirmAction.action === 'start') {
            onAction(confirmAction.serverId, confirmAction.serverName, 'start');
          } else if (confirmAction.action === 'stop') {
            onAction(confirmAction.serverId, confirmAction.serverName, 'stop');
          } else if (confirmAction.action === 'restart') {
            onAction(confirmAction.serverId, confirmAction.serverName, 'restart');
          } else if (confirmAction.action === 'startAll') {
            onStartAll();
          } else if (confirmAction.action === 'stopAll') {
            onStopAll();
          } else if (confirmAction.action === 'delete') {
            onDelete(confirmAction.serverId);
          }
        }}
        title={
          confirmAction.action === 'start'
            ? 'Start Server'
            : confirmAction.action === 'stop'
              ? 'Stop Server'
              : confirmAction.action === 'restart'
                ? 'Restart Server'
                : confirmAction.action === 'startAll'
                  ? 'Start All Servers'
                  : confirmAction.action === 'stopAll'
                    ? 'Stop All Servers'
                    : 'Delete Server'
        }
        message={
          confirmAction.action === 'startAll'
            ? `Are you sure you want to start all ${servers.length} server(s)?`
            : confirmAction.action === 'stopAll'
              ? `Are you sure you want to stop all ${servers.length} server(s)? All connected players will be disconnected.`
              : confirmAction.action === 'restart'
                ? `Do you want to restart this server? The server will be temporarily unavailable.`
                : confirmAction.action === 'stop'
                  ? `Do you want to stop this server? All connected players will be disconnected.`
                  : confirmAction.action === 'delete'
                    ? `Delete "${confirmAction.serverName}" now? This action is immediate and cannot be undone.`
                    : `Do you want to start this server?`
        }
        confirmText={
          confirmAction.action === 'start' || confirmAction.action === 'startAll'
            ? 'Start'
            : confirmAction.action === 'stop' || confirmAction.action === 'stopAll'
              ? 'Stop'
              : confirmAction.action === 'delete'
                ? 'Delete'
                : 'Restart'
        }
        confirmButtonClass={
          confirmAction.action === 'start' || confirmAction.action === 'startAll'
            ? 'bg-green-600 hover:bg-green-700'
            : confirmAction.action === 'restart'
              ? 'bg-orange-600 hover:bg-orange-700'
              : confirmAction.action === 'delete'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-red-600 hover:bg-red-700'
        }
        requiredText={confirmAction.action === 'delete' ? confirmAction.serverName : undefined}
      />
    </div>
  );
}




