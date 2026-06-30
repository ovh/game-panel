import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  Copy,
  Edit2,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Play,
  Plus,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type { GameServer } from '../../types/gameServer';
import type { AuthUser } from '../../utils/permissions';
import { AppButton, AppInput, AppTable } from '../../src/ui/components';
import { useTheme } from '../../contexts/ThemeContext';
import {
  isServerRunningStatus,
  isServerStoppedStatus,
  isServerTransitioningStatus,
  isServerCreatingStatus,
  isServerInstallingStatus,
} from '../../utils/serverRuntime';
import {
  formatNetworkSpeed,
  type MetricType,
  type SortField,
  type SortOrder,
  canOpenServerSettings,
  getServerStatusPresentation,
  hasServerPermission,
} from './utils';
import { ODS_CHART_THEME } from '../charts/theme';

interface ConfirmActionState {
  show: boolean;
  serverId: string;
  serverName: string;
  action: 'start' | 'stop' | 'restart' | 'stopAll' | 'startAll' | 'delete';
}

interface GameServersDesktopTableProps {
  filteredAndSortedServers: GameServer[];
  currentUser?: AuthUser | null;
  permissionsByServer?: Record<string, string[]>;
  borderColor: string;
  rowBorder: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  inputBg: string;
  inputBorder: string;
  editingId: string | null;
  editValue: string;
  setEditValue: (value: string) => void;
  handleSaveEdit: (id: string) => void;
  handleCancelEdit: () => void;
  handleStartEdit: (server: GameServer) => void;
  getGameLabel: (server: GameServer) => string;
  openConnectionModal: (server: GameServer) => void;
  openHistoryModal: (server: GameServer, canReadLogs: boolean) => void;
  openMetricModal: (server: GameServer, metric: MetricType) => void;
  visibleMetrics: MetricType[];
  onToggleMetric: (metric: MetricType) => void;
  copyConnectionAddress: (port: number) => void;
  getConnectionCopyState: (port: number) => 'idle' | 'success' | 'error';
  setConfirmAction: (state: ConfirmActionState) => void;
  handleOpenSettings: (server: GameServer) => void;
  onAction: (serverId: string, serverName: string, action: string) => void;
  canOpenInstallModal: boolean;
  canInstall: boolean;
  onOpenInstallModal?: () => void;
  publicConnectionHost: string;
  sortField: SortField;
  sortOrder: SortOrder;
  handleSort: (field: SortField) => void;
}

const getSortIcon = (sortField: SortField, sortOrder: SortOrder, field: SortField) => {
  if (sortField !== field) {
    return <ArrowUpDown className="w-4 h-4 text-gray-500" />;
  }
  return sortOrder === 'asc' ? (
    <ArrowUp className="w-4 h-4 text-[var(--color-cyan-400)]" />
  ) : (
    <ArrowDown className="w-4 h-4 text-[var(--color-cyan-400)]" />
  );
};

export function GameServersDesktopTable({
  filteredAndSortedServers,
  currentUser,
  permissionsByServer,
  borderColor,
  rowBorder,
  textPrimary,
  textSecondary,
  textTertiary,
  inputBg,
  inputBorder,
  editingId,
  editValue,
  setEditValue,
  handleSaveEdit,
  handleCancelEdit,
  handleStartEdit,
  getGameLabel,
  openConnectionModal,
  openHistoryModal,
  openMetricModal,
  visibleMetrics,
  onToggleMetric,
  copyConnectionAddress,
  getConnectionCopyState,
  setConfirmAction,
  handleOpenSettings,
  onAction,
  canOpenInstallModal,
  canInstall,
  onOpenInstallModal,
  publicConnectionHost,
  sortField,
  sortOrder,
  handleSort,
}: GameServersDesktopTableProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [metricsPopoverOpen, setMetricsPopoverOpen] = useState(false);
  const [metricsPopoverPos, setMetricsPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const metricsButtonRef = useRef<HTMLButtonElement>(null);
  const metricsPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!metricsPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        metricsButtonRef.current?.contains(target) ||
        metricsPopoverRef.current?.contains(target)
      ) {
        return;
      }
      setMetricsPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [metricsPopoverOpen]);

  // The table lives inside an `overflow-x-auto` wrapper, which forces
  // `overflow-y: auto` and clips an absolutely-positioned dropdown (causing a
  // stray scrollbar). Render the popover in a portal with fixed positioning so
  // it escapes the scroll container entirely.
  useEffect(() => {
    if (!metricsPopoverOpen) return;
    const updatePosition = () => {
      const rect = metricsButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setMetricsPopoverPos({ top: rect.bottom + 4, left: rect.left });
      }
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [metricsPopoverOpen]);

  const METRIC_LABELS: Record<MetricType, string> = {
    cpu: 'CPU',
    memory: 'RAM',
    disk: 'Disk',
    network: 'Network',
  };

  const powerButtonClass =
    'gp-btn-power inline-flex h-10 w-10 min-w-10 shrink-0 items-center justify-center rounded-lg border p-0 shadow-sm transition-all';

  return (
    <div className="hidden lg:block">
    <div className="overflow-x-auto">
      <AppTable className="gp-game-servers-table w-full">
        <thead>
          <tr className={`border-b ${borderColor}`}>
            <th
              aria-sort={sortField === 'name' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={`text-left ${textTertiary} text-xs font-semibold uppercase tracking-wider py-3 px-4`}
            >
              <AppButton
                onClick={() => handleSort('name')}
                tone="ghost"
                className="flex h-auto items-center gap-2 border-none bg-transparent p-0 text-xs font-semibold uppercase tracking-wider text-inherit hover:text-[var(--color-cyan-400)]"
              >
                Server Name
                {getSortIcon(sortField, sortOrder, 'name')}
              </AppButton>
            </th>
            <th
              aria-sort={sortField === 'game' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={`text-left ${textTertiary} text-xs font-semibold uppercase tracking-wider py-3 px-4`}
            >
              <AppButton
                onClick={() => handleSort('game')}
                tone="ghost"
                className="flex h-auto items-center gap-2 border-none bg-transparent p-0 text-xs font-semibold uppercase tracking-wider text-inherit hover:text-[var(--color-cyan-400)]"
              >
                Game
                {getSortIcon(sortField, sortOrder, 'game')}
              </AppButton>
            </th>
            <th className={`text-left ${textTertiary} text-xs font-semibold uppercase tracking-wider py-3 px-4`}>Connection</th>
            <th
              aria-sort={sortField === 'status' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={`text-left ${textTertiary} text-xs font-semibold uppercase tracking-wider py-3 px-4`}
            >
              <AppButton
                onClick={() => handleSort('status')}
                tone="ghost"
                className="flex h-auto items-center gap-2 border-none bg-transparent p-0 text-xs font-semibold uppercase tracking-wider text-inherit hover:text-[var(--color-cyan-400)]"
              >
                Status
                {getSortIcon(sortField, sortOrder, 'status')}
              </AppButton>
            </th>
            <th className={`text-left ${textTertiary} text-xs font-semibold uppercase tracking-wider py-3 px-4`}>
              <div className="flex items-center gap-1.5">
                Server Metrics
                <div
                  className="relative ml-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setMetricsPopoverOpen(false);
                  }}
                >
                  <button
                    type="button"
                    ref={metricsButtonRef}
                    onClick={() => setMetricsPopoverOpen((v) => !v)}
                    aria-label="Customize visible metrics"
                    aria-haspopup="true"
                    aria-expanded={metricsPopoverOpen}
                    className={`rounded p-0.5 transition-colors hover:bg-gray-700/60 ${metricsPopoverOpen ? 'text-[var(--color-cyan-400)]' : ''}`}
                    title="Customize visible metrics"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                  {metricsPopoverOpen && metricsPopoverPos && createPortal(
                    <div
                      ref={metricsPopoverRef}
                      style={{ top: metricsPopoverPos.top, left: metricsPopoverPos.left }}
                      className="fixed z-50 w-36 rounded-lg border border-gray-700 bg-[#0f172a] py-1 shadow-xl"
                    >
                      {(['cpu', 'memory', 'disk', 'network'] as const).map((type) => {
                        const isChecked = visibleMetrics.includes(type);
                        const isOnlyChecked = isChecked && visibleMetrics.length === 1;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => !isOnlyChecked && onToggleMetric(type)}
                            disabled={isOnlyChecked}
                            className={`group flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                              isOnlyChecked
                                ? 'cursor-default text-gray-500'
                                : 'text-gray-300'
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                isChecked
                                  ? 'border-[var(--color-cyan-400)] bg-[var(--color-cyan-400)]/20 text-[var(--color-cyan-400)]'
                                  : 'border-gray-600 group-hover:border-gray-400 group-hover:bg-gray-700/50'
                              }`}
                            >
                              {isChecked && <Check className="w-2.5 h-2.5" />}
                            </span>
                            {METRIC_LABELS[type]}
                          </button>
                        );
                      })}
                    </div>,
                    document.body
                  )}
                </div>
              </div>
            </th>
            <th className={`text-left ${textTertiary} text-xs font-semibold uppercase tracking-wider py-3 px-4`}>Power</th>
            <th className={`text-left ${textTertiary} text-xs font-semibold uppercase tracking-wider py-3 px-4`}>Management</th>
            <th className={`text-center ${textTertiary} text-xs font-semibold uppercase tracking-wider py-3 px-4`}>Delete</th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSortedServers.length === 0 && (
            <tr>
              <td colSpan={8} className="py-12 text-center">
                <p className={`text-sm ${textTertiary}`}>No game servers yet.</p>
                <p className={`mt-1 text-xs ${textTertiary}`}>
                  Use “Add Game Server” below to install your first one.
                </p>
              </td>
            </tr>
          )}
          {filteredAndSortedServers.map((server) => {
            const { normalizedStatus, label: statusLabel, className: statusClassName } =
              getServerStatusPresentation(server.status);
            const connectionCopyState = server.port ? getConnectionCopyState(server.port) : 'idle';
            const isRunning = isServerRunningStatus(server.status);
            const isStopped = isServerStoppedStatus(server.status);
            const isCreating = isServerCreatingStatus(server.status);
            const isInstalling = isServerInstallingStatus(server.status);
            const isTransitioning = isServerTransitioningStatus(server.status);
            const canPowerServer = hasServerPermission(
              currentUser,
              permissionsByServer,
              server.id,
              'server.power'
            );
            // creating blocks all power actions; installing/transitioning block start/restart only
            const canTriggerPowerAction = canPowerServer && !isCreating && !isTransitioning;
            const canReadLogs = hasServerPermission(
              currentUser,
              permissionsByServer,
              server.id,
              'container.logs.read'
            );
            const canDeleteServer = hasServerPermission(
              currentUser,
              permissionsByServer,
              server.id,
              'server.delete'
            );
            const canRenameServer = hasServerPermission(
              currentUser,
              permissionsByServer,
              server.id,
              'server.edit'
            );
            const canOpenSettings = canOpenServerSettings(currentUser, permissionsByServer, server.id) && !isCreating;

            return (
              <tr key={server.id} className={`border-b ${rowBorder}`}>
                <td className={`${textPrimary} py-4 px-4`}>
                  {editingId === server.id ? (
                    <div className="flex items-center gap-2">
                      <AppInput
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(server.id);
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className={`${inputBg} border ${inputBorder} rounded px-2 py-1 ${textPrimary} focus:outline-none focus:border-[#0050D5]`}
                        autoFocus
                      />
                      <AppButton
                        onClick={() => handleSaveEdit(server.id)}
                        className="flex-shrink-0 p-1.5 rounded text-green-400 hover:text-green-300"
                      >
                        <Check className="w-4 h-4" />
                      </AppButton>
                      <AppButton onClick={handleCancelEdit} className="flex-shrink-0 p-1.5 rounded text-red-400 hover:text-red-300">
                        <X className="w-4 h-4" />
                      </AppButton>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span>{server.name}</span>
                      <AppButton
                        onClick={() => {
                          if (!canRenameServer) return;
                          handleStartEdit(server);
                        }}
                        disabled={!canRenameServer}
                        className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                          canRenameServer
                            ? 'text-gray-400 hover:text-[var(--color-cyan-400)]'
                            : 'text-gray-600 cursor-not-allowed'
                        }`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </AppButton>
                    </div>
                  )}
                </td>
                <td className={`${textSecondary} py-4 px-4`}>{getGameLabel(server)}</td>
                <td className="py-4 px-4">
                  {server.port ? (
                    <div className="flex items-center gap-2 group">
                      <AppButton
                        type="button"
                        tone="ghost"
                        onClick={() => openConnectionModal(server)}
                        className="rounded border-none bg-transparent px-2 py-1 text-xs font-mono text-cyan-400 transition-colors hover:bg-gray-700/60 hover:text-[var(--color-cyan-400)]"
                        title="Open ports list"
                      >
                        {publicConnectionHost}:{server.port}
                      </AppButton>
                      <AppButton
                        tone="ghost"
                        onClick={() => {
                          if (!server.port) return;
                          copyConnectionAddress(server.port);
                        }}
                        className={`rounded border-none p-1.5 transition-all ${
                          connectionCopyState === 'success'
                            ? 'bg-green-500/20 text-green-400 opacity-100'
                            : connectionCopyState === 'error'
                              ? 'bg-red-500/20 text-red-400 opacity-100'
                              : 'bg-transparent text-gray-400 hover:bg-gray-700/60 hover:text-[var(--color-cyan-400)]'
                        }`}
                        title={
                          connectionCopyState === 'success'
                            ? 'Copied!'
                            : connectionCopyState === 'error'
                              ? 'Copy failed'
                              : 'Copy to clipboard'
                        }
                      >
                        {connectionCopyState === 'success' ? (
                          <Check className="w-4 h-4" />
                        ) : connectionCopyState === 'error' ? (
                          <AlertCircle className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </AppButton>
                    </div>
                  ) : (
                    <span className={`text-sm ${textTertiary}`}>–</span>
                  )}
                </td>
                <td className="py-4 pr-4 pl-0">
                  <div className="flex justify-start">
                  <AppButton
                    type="button"
                    onClick={() => openHistoryModal(server, canReadLogs)}
                    disabled={!canReadLogs}
                    title={canReadLogs ? 'Open history logs' : 'Missing permission: container.logs.read'}
                    className={`gp-status-badge inline-flex items-center justify-center rounded-full border px-4 py-1 text-sm font-semibold leading-none tracking-[0.04em] transition-colors ${statusClassName} ${
                      canReadLogs ? 'hover:brightness-110' : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    {statusLabel}
                  </AppButton>
                  </div>
                </td>
                <td className="py-4 px-4">
                  {isServerRunningStatus(server.status) ? (
                    <div className="flex flex-col gap-0.5 min-w-[185px]">
                      {visibleMetrics.includes('cpu') && (
                      <button
                        type="button"
                        onClick={() => openMetricModal(server, 'cpu')}
                        className="group flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-gray-700/40"
                        title="Open CPU history"
                      >
                        <span className="w-7 shrink-0 text-[10px] font-medium uppercase text-gray-500 transition-colors group-hover:text-gray-300">CPU</span>
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-800/80">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(server.cpuUsage ?? 0, 100)}%`, backgroundColor: ODS_CHART_THEME.cpu }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right font-mono text-xs text-gray-300">
                          {server.cpuUsage !== undefined ? `${server.cpuUsage.toFixed(1)}%` : '–'}
                        </span>
                      </button>
                      )}
                      {visibleMetrics.includes('memory') && (
                        <button
                          type="button"
                          onClick={() => openMetricModal(server, 'memory')}
                          className="group flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-gray-700/40"
                          title="Open Memory history"
                        >
                          <span className="w-7 shrink-0 text-[10px] font-medium uppercase text-gray-500 transition-colors group-hover:text-gray-300">RAM</span>
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-800/80">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(server.memoryUsage ?? 0, 100)}%`, backgroundColor: ODS_CHART_THEME.ram }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right font-mono text-xs text-gray-300">
                            {server.memoryUsage !== undefined ? `${server.memoryUsage.toFixed(1)}%` : '–'}
                          </span>
                        </button>
                      )}
                      {visibleMetrics.includes('disk') && (
                        <button
                          type="button"
                          onClick={() => openMetricModal(server, 'disk')}
                          className="group flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-gray-700/40"
                          title="Open Disk history"
                        >
                          <span className="w-7 shrink-0 text-[10px] font-medium uppercase text-gray-500 transition-colors group-hover:text-gray-300">DISK</span>
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-800/80">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(server.diskUsage ?? 0, 100)}%`, backgroundColor: ODS_CHART_THEME.disk }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right font-mono text-xs text-gray-300">
                            {server.diskUsage !== undefined ? `${server.diskUsage.toFixed(1)}%` : '–'}
                          </span>
                        </button>
                      )}
                      {visibleMetrics.includes('network') && (
                        <button
                          type="button"
                          onClick={() => openMetricModal(server, 'network')}
                          className="group flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-gray-700/40"
                          title="Open Network history"
                        >
                          <span className="w-7 shrink-0 text-[10px] font-medium uppercase text-gray-500 transition-colors group-hover:text-gray-300">NET</span>
                          <span className="flex-1 font-mono text-xs text-gray-300">
                            {server.networkIn !== undefined ? (
                              <>
                                <span style={{ color: ODS_CHART_THEME.networkIn }}>↑</span>
                                {` ${formatNetworkSpeed(server.networkIn)}  `}
                                <span style={{ color: ODS_CHART_THEME.networkOut }}>↓</span>
                                {` ${formatNetworkSpeed(server.networkOut)}`}
                              </>
                            ) : '–'}
                          </span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className={`text-sm ${textTertiary}`}>–</span>
                  )}
                </td>
                <td className="py-4 px-4">
                  <div className="flex gap-2">
                    {isRunning ? (
                      <AppButton
                        disabled={!canTriggerPowerAction}
                        onClick={() =>
                          setConfirmAction({
                            show: true,
                            serverId: server.id,
                            serverName: server.name,
                            action: 'stop',
                          })
                        }
                        className={`${powerButtonClass} ${
                          canTriggerPowerAction
                            ? 'bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border-red-600/30 hover:border-red-600'
                            : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                        }`}
                        title="Stop"
                      >
                        <Square className="w-4 h-4" />
                      </AppButton>
                    ) : isStopped ? (
                      <AppButton
                        disabled={!canTriggerPowerAction}
                        onClick={() =>
                          setConfirmAction({
                            show: true,
                            serverId: server.id,
                            serverName: server.name,
                            action: 'start',
                          })
                        }
                        className={`${powerButtonClass} ${
                          canTriggerPowerAction
                            ? 'bg-green-600/10 hover:bg-green-600 text-green-400 hover:text-white border-green-600/30 hover:border-green-600'
                            : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                        }`}
                        title="Start"
                      >
                        <Play className="w-4 h-4" />
                      </AppButton>
                    ) : normalizedStatus === 'stopping' ? (
                      <AppButton
                        disabled
                        className={`${powerButtonClass} bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed`}
                        title="Stopping"
                      >
                        <Square className="w-4 h-4" />
                      </AppButton>
                    ) : normalizedStatus === 'restarting' ? (
                      <AppButton
                        disabled
                        className={`${powerButtonClass} bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed`}
                        title="Restarting"
                      >
                        <RotateCw className="w-4 h-4" />
                      </AppButton>
                    ) : isInstalling ? (
                      // Installing: container exists → allow stopping the install
                      <AppButton
                        disabled={!canPowerServer}
                        onClick={() =>
                          setConfirmAction({
                            show: true,
                            serverId: server.id,
                            serverName: server.name,
                            action: 'stop',
                          })
                        }
                        className={`${powerButtonClass} ${
                          canPowerServer
                            ? 'bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border-red-600/30 hover:border-red-600'
                            : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                        }`}
                        title="Stop installation"
                      >
                        <Square className="w-4 h-4" />
                      </AppButton>
                    ) : (
                      // creating or starting: fully locked
                      <AppButton
                        disabled
                        className={`${powerButtonClass} bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed`}
                        title={isCreating ? 'Creating…' : 'Starting'}
                      >
                        <Play className="w-4 h-4" />
                      </AppButton>
                    )}
                    <AppButton
                      disabled={!canPowerServer || isCreating || isInstalling || isTransitioning}
                      onClick={() =>
                        setConfirmAction({
                          show: true,
                          serverId: server.id,
                          serverName: server.name,
                          action: 'restart',
                        })
                      }
                      className={`${powerButtonClass} ${
                        canPowerServer && !isCreating && !isInstalling && !isTransitioning
                          ? 'bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border-orange-600/30 hover:border-orange-600'
                          : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                      }`}
                      title={isCreating || isInstalling || isTransitioning ? `Unavailable while ${statusLabel.toLowerCase()}` : 'Restart'}
                    >
                      <RotateCw className="w-4 h-4" />
                    </AppButton>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <div className="flex gap-2">
                    <AppButton
                      disabled={!canOpenSettings}
                      onClick={() => handleOpenSettings(server)}
                      className={`gp-btn-settings px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 ${
                        canOpenSettings
                          ? 'bg-gray-700 hover:bg-gray-600 text-white'
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </AppButton>
                    <AppButton
                      disabled={!canReadLogs}
                      onClick={() => onAction(server.id, server.name, 'console')}
                      className={`gp-btn-logs px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 whitespace-nowrap ${
                        canReadLogs
                          ? isDark
                            ? 'bg-[var(--gp-ods-accent-primary)] text-white hover:bg-[var(--gp-ods-accent-secondary)]'
                            : '!bg-[var(--gp-primary-700)] !text-white hover:!bg-[var(--gp-primary-600)]'
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Terminal className="w-4 h-4" />
                      Log/Console
                    </AppButton>
                  </div>
                </td>
                <td className="py-4 px-4 text-center">
                  <AppButton
                    tone="ghost"
                    disabled={!canDeleteServer}
                    onClick={() =>
                      setConfirmAction({
                        show: true,
                        serverId: server.id,
                        serverName: server.name,
                        action: 'delete',
                      })
                    }
                    className={
                      canDeleteServer
                        ? 'rounded-lg border-none bg-transparent p-2 text-red-400 transition-colors hover:bg-red-500/15 hover:text-red-300'
                        : 'rounded-lg border-none bg-transparent p-2 text-gray-600 cursor-not-allowed'
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </AppButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AppTable>
    </div>
    <div className="flex justify-center py-6">
      <AppButton
        type="button"
        onClick={() => {
          if (!canOpenInstallModal) return;
          onOpenInstallModal?.();
        }}
        disabled={!canOpenInstallModal}
        className={`gp-add-server-button group inline-flex h-10 min-w-[240px] items-center justify-center gap-2 rounded-md px-6 py-0 font-semibold leading-none transition-all ${
          canOpenInstallModal
            ? isDark
              ? 'border-2 border-[var(--color-cyan-400)]/45 bg-[#0050D7]/10 text-[var(--color-cyan-400)] hover:bg-[#157EEA]/20 hover:border-[var(--color-cyan-400)] hover:text-white'
              : '!border-0 !bg-[var(--gp-primary-700)] !text-white hover:!bg-[var(--gp-primary-600)]'
            : 'border border-gray-700 bg-gray-800 text-gray-500 cursor-not-allowed'
        }`}
        title={canInstall ? 'Install game server' : 'Missing permission: server.install'}
      >
        <span className={`inline-flex h-6 w-6 items-center justify-center self-center transition-colors ${isDark ? 'text-[var(--color-cyan-400)] group-hover:text-white' : '!text-white'}`}>
          <Plus className="h-5 w-5 stroke-[3]" />
        </span>
        <span className="self-center leading-none">Add Game Server</span>
      </AppButton>
    </div>
    </div>
  );
}



