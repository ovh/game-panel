import type { GameServer, GameServerStatus } from '../types/gameServer';
import { useDeferredValue, useState, useMemo, useEffect, useRef } from 'react';
import { ServerSettingsModal } from './ServerSettingsModal';
import { ConfirmationModal } from './ConfirmationModal';
import type { AuthUser } from '../utils/permissions';
import { apiClient, PUBLIC_CONNECTION_HOST } from '../utils/api';
import {
  isServerRunningStatus,
  type ServerHistoryEntry,
  type ServerMetricHistoryPoint,
} from '../utils/serverRuntime';
import { GameServersTableDialogs } from './gameServersTable/GameServersTableDialogs';
import { GameServersMobileList } from './gameServersTable/GameServersMobileList';
import { GameServersDesktopTable } from './gameServersTable/GameServersDesktopTable';
import { AppButton } from '../src/ui/components';
import { ODS_CHART_THEME } from './charts/theme';
import {
  type MetricType,
  type SortField,
  type SortOrder,
  METRICS_HISTORY_REQUEST_LIMIT,
  formatMetricValue,
  getMetricZoomedData,
} from './gameServersTable/utils';

interface GameServersTableProps {
  servers: GameServer[];
  metricsHistoryByServer?: Record<string, ServerMetricHistoryPoint[]>;
  historyByServer?: Record<string, ServerHistoryEntry[]>;
  gameNamesByKey: Record<string, string>;
  terminalReadyByServer?: Record<string, boolean | null>;
  currentUser?: AuthUser | null;
  permissionsByServer?: Record<string, string[]>;
  onDelete: (id: string) => void;
  onAction: (serverId: string, serverName: string, action: string) => void;
  onOpenConsoleTerminal: (serverId: string, serverName: string) => void;
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
  terminalReadyByServer,
  currentUser,
  permissionsByServer,
  onDelete,
  onAction,
  onOpenConsoleTerminal,
  onRename,
  onRefresh,
  onStartAll,
  onStopAll,
  canInstall = false,
  onOpenInstallModal,
}: GameServersTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [consoleBlinkByServer, setConsoleBlinkByServer] = useState<Record<string, boolean>>({});
  const previousReadyByServerRef = useRef<Record<string, boolean | null>>({});

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<GameServer | null>(null);

  const [confirmAction, setConfirmAction] = useState<{
    show: boolean;
    serverId: string;
    serverName: string;
    action: 'start' | 'stop' | 'restart' | 'stopAll' | 'startAll' | 'delete';
  }>({ show: false, serverId: '', serverName: '', action: 'start' });

  const [nameFilter, setNameFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [statusFilter] = useState<'ALL' | GameServerStatus>('ALL');

  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [metricModal, setMetricModal] = useState<{
    isOpen: boolean;
    serverId: string;
    metric: MetricType;
  }>({ isOpen: false, serverId: '', metric: 'cpu' });
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

  const getGameLabel = (gameKey: string) => {
    return gameNamesByKey[gameKey] || gameKey;
  };

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

  const renderMetricCell = (server: GameServer, metric: MetricType, value?: number) => {
    const content = formatMetricValue(server.status, value);
    if (!isServerRunningStatus(server.status)) {
      return <span>{content}</span>;
    }

    return (
      <AppButton
        type="button"
        tone="ghost"
        onClick={() => openMetricModal(server, metric)}
        className="inline-flex items-center rounded-md border-none bg-transparent px-2 py-1 -mx-2 text-inherit hover:bg-gray-700 hover:text-[var(--color-cyan-400)] transition-colors"
        title={`Open ${metric === 'cpu' ? 'CPU' : 'Memory'} history`}
      >
        {content === 'Loading' ? (
          <span className={textTertiary}>Loading</span>
        ) : (
          <span>{content}</span>
        )}
      </AppButton>
    );
  };

  useEffect(() => {
    const nextReadyByServer = terminalReadyByServer || {};
    const previousReadyByServer = previousReadyByServerRef.current;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    Object.keys(nextReadyByServer).forEach((serverId) => {
      const isReady = nextReadyByServer[serverId] === true;
      const wasReady = previousReadyByServer[serverId] === true;

      if (isReady && !wasReady) {
        setConsoleBlinkByServer((prev) => ({
          ...prev,
          [serverId]: true,
        }));

        const timer = setTimeout(() => {
          setConsoleBlinkByServer((prev) => ({
            ...prev,
            [serverId]: false,
          }));
        }, 1700);

        timers.push(timer);
      }
    });

    previousReadyByServerRef.current = {
      ...previousReadyByServer,
      ...nextReadyByServer,
    };

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [terminalReadyByServer]);

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
        const label = getGameLabel(server.game).toLowerCase();
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
          aValue = getGameLabel(a.game);
          bValue = getGameLabel(b.game);
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
    if (!selectedMetricServer) return [];

    const source = metricsHistoryByServer?.[selectedMetricServer.id] ?? [];
    const next = [...source];

    const latestCpu = Number.isFinite(selectedMetricServer.cpuUsage)
      ? selectedMetricServer.cpuUsage
      : null;
    const latestMemory = Number.isFinite(selectedMetricServer.memoryUsage)
      ? selectedMetricServer.memoryUsage
      : null;
    const hasLiveMetric = metricModal.metric === 'cpu' ? latestCpu !== null : latestMemory !== null;

    if (hasLiveMetric) {
      const last = next[next.length - 1];
      const now = Date.now();
      if (!last || now - last.timestamp > 15000) {
        next.push({
          timestamp: now,
          cpuUsage: latestCpu ?? 0,
          memoryUsage: latestMemory ?? 0,
        });
      }
    }

    return next.map((point) => {
      const date = new Date(point.timestamp);
      return {
        timestamp: point.timestamp,
        time: date.toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        value: metricModal.metric === 'cpu' ? point.cpuUsage : point.memoryUsage,
      };
    });
  }, [metricsHistoryByServer, metricModal.metric, selectedMetricServer]);
  const deferredMetricModalAllData = useDeferredValue(metricModalAllData);

  const metricModalChartData = useMemo(
    () => getMetricZoomedData(deferredMetricModalAllData, metricZoom, metricOffset),
    [deferredMetricModalAllData, metricZoom, metricOffset]
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

  const cardBg = 'bg-[#111827]';
  const cardBorder = 'border-gray-800';
  const cardShadow = '';
  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-300';
  const textTertiary = 'text-gray-400';
  const inputBg = 'bg-[#1f2937]';
  const inputBorder = 'border-gray-700';
  const borderColor = 'border-gray-700';
  const rowBorder = 'border-gray-800';
  const metricChartColor = metricModal.metric === 'cpu' ? ODS_CHART_THEME.cpu : ODS_CHART_THEME.ram;
  const metricLabel = metricModal.metric === 'cpu' ? 'CPU' : 'Memory';
  const canOpenInstallModal = Boolean(onOpenInstallModal) && canInstall;

  return (
    <div
      className={`${cardBg} rounded-lg border ${cardBorder} ${cardShadow} mb-6 px-3 pt-3 pb-0 md:px-6 md:pt-6 md:pb-0`}
    >
      <div className="mb-3 md:mb-4">
        <h2 className={`text-lg md:text-xl ${textPrimary}`}>Game Servers</h2>
      </div>

      <GameServersDesktopTable
        filteredAndSortedServers={filteredAndSortedServers}
        terminalReadyByServer={terminalReadyByServer}
        consoleBlinkByServer={consoleBlinkByServer}
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
        renderMetricCell={renderMetricCell}
        copyConnectionAddress={copyConnectionAddress}
        getConnectionCopyState={getConnectionCopyState}
        setConfirmAction={setConfirmAction}
        handleOpenSettings={handleOpenSettings}
        onAction={onAction}
        onOpenConsoleTerminal={onOpenConsoleTerminal}
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
        terminalReadyByServer={terminalReadyByServer}
        consoleBlinkByServer={consoleBlinkByServer}
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
        onOpenConsoleTerminal={onOpenConsoleTerminal}
        canOpenInstallModal={canOpenInstallModal}
        canInstall={canInstall}
        onOpenInstallModal={onOpenInstallModal}
      />

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
        metricLabel={metricLabel}
        metricModalChartData={metricModalChartData}
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

      <ServerSettingsModal
        isOpen={settingsModalOpen}
        onClose={handleCloseSettings}
        serverName={liveSelectedServer?.name || ''}
        serverGame={liveSelectedServer?.game || ''}
        serverStatus={liveSelectedServer?.status || null}
        serverId={liveSelectedServer ? Number(liveSelectedServer.id) : null}
        serverSftpUsername={liveSelectedServer?.sftpUsername || ''}
        serverSftpEnabled={liveSelectedServer?.sftpEnabled === true}
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
                ? `Are you sure you want to restart "${confirmAction.serverName}"? The server will be temporarily unavailable.`
                : confirmAction.action === 'stop'
                  ? `Are you sure you want to stop "${confirmAction.serverName}"? All connected players will be disconnected.`
                  : confirmAction.action === 'delete'
                    ? `Delete "${confirmAction.serverName}" now? This action is immediate and cannot be undone.`
                    : `Are you sure you want to start "${confirmAction.serverName}"?`
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
      />
    </div>
  );
}




