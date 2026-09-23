import { useState } from 'react';
import {
  Check,
  Copy,
  Edit2,
  Play,
  RotateCw,
  Settings,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type { GameServer, ServerPlayers } from '../../types/gameServer';
import type { AuthUser } from '../../utils/permissions';
import { PUBLIC_CONNECTION_HOST } from '../../utils/api';
import {
  isServerUpLike,
  isServerDownLike,
  isServerTransitioningStatus,
  isServerCreatingStatus,
  isServerInstallingStatus,
} from '../../utils/serverRuntime';
import { canOpenServerSettings, formatNetworkSpeed, formatPlayerCount, hasServerPermission, playersHaveNames, type MetricType } from './utils';
import { getServerStatusPresentation } from './utils';
import { ODS_CHART_THEME } from '../charts/theme';
import { AppButton } from '../../src/ui/components';

export type ConfirmServerAction = 'start' | 'stop' | 'restart' | 'delete';

export interface GameServerCardActions {
  currentUser?: AuthUser | null;
  permissionsByServer?: Record<string, string[]>;
  players?: Record<string, ServerPlayers>;
  showPlayers?: boolean;
  onOpenPlayers?: (serverId: string) => void;
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
  onConfirmAction: (serverId: string, serverName: string, action: ConfirmServerAction) => void;
  handleOpenSettings: (server: GameServer) => void;
  onAction: (serverId: string, serverName: string, action: string) => void;
}

export interface GameServerCardProps extends GameServerCardActions {
  server: GameServer;
  variant?: 'list' | 'grid';
}

function metricBarColor(metric: 'cpu' | 'memory' | 'disk'): string {
  return metric === 'cpu' ? ODS_CHART_THEME.cpu : metric === 'memory' ? ODS_CHART_THEME.ram : ODS_CHART_THEME.disk;
}

// Card surfaces are self-themed (light/dark). The action buttons keep the mobile's
// exact classes + `gp-btn-*` markers and stay AppButton so the shared light-mode
// colour overrides in globals.css (scoped to gp-game-servers-{table,mobile,grid}) apply.
const CARD = 'border-gray-200 bg-white dark:border-gray-800 dark:bg-[#1f2937]';
const TEXT_PRIMARY = 'text-gray-900 dark:text-white';
const TEXT_SECONDARY = 'text-gray-600 dark:text-gray-300';
const TEXT_TERTIARY = 'text-gray-500 dark:text-gray-400';
const METRIC_BOX = 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800';
const METRIC_DIVIDER = 'bg-gray-200 dark:bg-gray-700';
const METRIC_VALUE = `${TEXT_PRIMARY} hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[var(--color-cyan-400)]`;
const POWER_BASE = 'gp-btn-power flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border shadow-sm';
const POWER_DISABLED = 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed';

export function GameServerCard({
  server,
  currentUser,
  permissionsByServer,
  players,
  showPlayers = false,
  onOpenPlayers,
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
  onConfirmAction,
  handleOpenSettings,
  onAction,
  variant = 'list',
}: GameServerCardProps) {
  const isGrid = variant === 'grid';
  const [copied, setCopied] = useState(false);
  const copyConnection = async () => {
    try {
      await navigator.clipboard.writeText(`${PUBLIC_CONNECTION_HOST}:${server.port}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  const { normalizedStatus, label: statusLabel, className: statusClassName } =
    getServerStatusPresentation(server.status);
  const isUpLike = isServerUpLike(server.status);
  const isDownLike = isServerDownLike(server.status);
  const isCreating = isServerCreatingStatus(server.status);
  const isInstalling = isServerInstallingStatus(server.status);
  const isTransitioning = isServerTransitioningStatus(server.status);
  const canPowerServer = hasServerPermission(currentUser, permissionsByServer, server.id, 'server.power');
  const canTriggerPowerAction = canPowerServer && !isCreating && !isTransitioning;
  const canReadLogs = hasServerPermission(currentUser, permissionsByServer, server.id, 'container.logs.read');
  const canDeleteServer = hasServerPermission(currentUser, permissionsByServer, server.id, 'server.delete');
  const canRenameServer = hasServerPermission(currentUser, permissionsByServer, server.id, 'server.edit');
  const canOpenSettings = canOpenServerSettings(currentUser, permissionsByServer, server.id) && !isCreating;

  return (
    <div
      className={`relative rounded-lg p-4 border ${CARD} ${
        isGrid
          ? 'transition-all duration-150 hover:-translate-y-0.5 hover:border-[#157EEA]/60 hover:shadow-[0_12px_30px_-14px_rgba(2,6,23,0.85)] motion-reduce:transition-none motion-reduce:hover:translate-y-0'
          : ''
      }`}
      role="listitem"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`min-w-0 flex-1 ${editingId === server.id ? '' : 'pr-32'}`}>
          {editingId === server.id ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveEdit(server.id);
                  if (event.key === 'Escape') handleCancelEdit();
                }}
                spellCheck={false}
                className="flex-1 rounded px-2 py-1 text-sm border bg-white text-gray-900 border-gray-300 dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:outline-none focus:border-[#0050D5]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleSaveEdit(server.id)}
                className="flex-shrink-0 p-1.5 rounded text-green-400 hover:text-green-300"
                aria-label="Save name"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex-shrink-0 p-1.5 rounded text-red-400 hover:text-red-300"
                aria-label="Cancel rename"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="group flex items-center gap-2 min-w-0">
              {isGrid && normalizedStatus === 'running' && (
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true" title="Live">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
              )}
              <h3 className={`min-w-0 font-semibold truncate ${TEXT_PRIMARY}`} title={server.name}>
                {server.name}
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!canRenameServer) return;
                  handleStartEdit(server);
                }}
                disabled={!canRenameServer}
                aria-label="Rename server"
                className={`shrink-0 p-1 rounded-md transition duration-150 motion-reduce:transition-none ${
                  isGrid
                    ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                    : ''
                } ${
                  canRenameServer
                    ? 'text-gray-400 hover:text-[var(--color-cyan-400)] hover:bg-gray-200 dark:hover:bg-gray-700/60'
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}
          <p className={`text-sm ${TEXT_SECONDARY} mt-1 truncate`} title={getGameLabel(server)}>{getGameLabel(server)}</p>
          <div className="mt-2">
            {server.port ? (
              <div className="flex items-center gap-1 -ml-2">
                <button
                  type="button"
                  onClick={() => openConnectionModal(server)}
                  className="rounded px-2 py-1 text-xs font-mono text-cyan-600 dark:text-cyan-400 transition-colors hover:bg-gray-100 dark:hover:bg-white/5 hover:text-[var(--color-cyan-400)]"
                  title="Open ports list"
                >
                  {PUBLIC_CONNECTION_HOST}:{server.port}
                </button>
                <button
                  type="button"
                  onClick={copyConnection}
                  title="Copy connection address"
                  aria-label="Copy connection address"
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[var(--color-cyan-400)] dark:hover:bg-white/5"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            ) : (
              <p className={`text-xs ${TEXT_TERTIARY}`}>Connection: -</p>
            )}
          </div>
        </div>
        {editingId !== server.id && (
          <AppButton
            type="button"
            onClick={() => openHistoryModal(server, canReadLogs)}
            disabled={!canReadLogs}
            title={
              normalizedStatus === 'failed' && server.lastError
                ? `Failed: ${server.lastError}`
                : canReadLogs
                  ? 'Open history logs'
                  : 'Missing permission: container.logs.read'
            }
            className={`gp-status-badge absolute right-4 top-4 inline-flex w-28 items-center justify-center rounded-full border px-2 py-1 text-center text-sm font-semibold leading-none tracking-[0.04em] [text-indent:0.04em] whitespace-nowrap transition-colors ${statusClassName} ${
              canReadLogs ? 'hover:brightness-110' : 'opacity-60 cursor-not-allowed'
            }`}
          >
            {statusLabel}
          </AppButton>
        )}
      </div>

      {showPlayers && (
        <div className="mb-3 flex items-center gap-2">
          <span className={`text-xs ${TEXT_TERTIARY}`}>Players</span>
          {playersHaveNames(players?.[server.id]) ? (
            <button
              type="button"
              onClick={() => onOpenPlayers?.(server.id)}
              className={`cursor-pointer text-sm ${TEXT_PRIMARY} transition-colors hover:text-[var(--color-cyan-400)]`}
            >
              {formatPlayerCount(players?.[server.id])}
            </button>
          ) : (
            <span className={`text-sm ${TEXT_SECONDARY}`}>{formatPlayerCount(players?.[server.id])}</span>
          )}
        </div>
      )}

      {(isGrid || isUpLike) && (isGrid ? (
        <div className="mb-3 space-y-2">
          {([['CPU', server.cpuUsage, 'cpu'], ['Memory', server.memoryUsage, 'memory'], ['Disk', server.diskUsage, 'disk']] as const).map(([label, value, metric]) => (
            <button
              key={metric}
              type="button"
              onClick={() => openMetricModal(server, metric)}
              className="block w-full text-left rounded px-1 -mx-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/5"
              title={`Open ${label} history`}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <span className={`text-xs ${TEXT_TERTIARY}`}>{label}</span>
                <span className={`text-xs font-semibold ${TEXT_PRIMARY}`}>
                  {value !== undefined ? `${value.toFixed(1)}%` : '–'}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%`, backgroundColor: metricBarColor(metric) }}
                />
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => openMetricModal(server, 'network')}
            className="flex w-full items-center justify-between rounded px-1 -mx-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/5"
            title="Open network history"
          >
            <span className={`text-xs ${TEXT_TERTIARY}`}>Network</span>
            <span className="text-xs font-mono text-gray-900 dark:text-white">
              {server.networkIn !== undefined ? (
                <>
                  <span className="text-cyan-500 dark:text-cyan-400">↑</span> {formatNetworkSpeed(server.networkIn)}
                  {'  '}
                  <span className="text-blue-500 dark:text-blue-400">↓</span> {formatNetworkSpeed(server.networkOut)}
                </>
              ) : '–'}
            </span>
          </button>
        </div>
      ) : (
        <>
          <div className={`flex items-center gap-3 mb-2 px-3 py-2 rounded-lg border ${METRIC_BOX}`}>
            <div className="flex-1 flex items-center justify-between min-w-0">
              <p className={`text-xs ${TEXT_TERTIARY}`}>CPU</p>
              <button
                type="button"
                onClick={() => openMetricModal(server, 'cpu')}
                className={`text-sm font-semibold rounded px-1.5 py-0.5 -mx-1.5 transition-colors ${METRIC_VALUE}`}
                title="Open CPU history"
              >
                {server.cpuUsage !== undefined ? `${server.cpuUsage.toFixed(2)}%` : '–'}
              </button>
            </div>
            <div className={`w-px h-6 ${METRIC_DIVIDER}`} />
            <div className="flex-1 flex items-center justify-between min-w-0">
              <p className={`text-xs ${TEXT_TERTIARY}`}>Memory</p>
              <button
                type="button"
                onClick={() => openMetricModal(server, 'memory')}
                className={`text-sm font-semibold rounded px-1.5 py-0.5 -mx-1.5 transition-colors ${METRIC_VALUE}`}
                title="Open memory history"
              >
                {server.memoryUsage !== undefined ? `${server.memoryUsage.toFixed(2)}%` : '–'}
              </button>
            </div>
          </div>
          <div className={`flex items-center gap-3 mb-3 px-3 py-2 rounded-lg border ${METRIC_BOX}`}>
            <div className="flex-1 flex items-center justify-between min-w-0">
              <p className={`text-xs ${TEXT_TERTIARY}`}>Disk</p>
              <button
                type="button"
                onClick={() => openMetricModal(server, 'disk')}
                className={`text-sm font-semibold rounded px-1.5 py-0.5 -mx-1.5 transition-colors ${METRIC_VALUE}`}
                title="Open disk history"
              >
                {server.diskUsage !== undefined ? `${server.diskUsage.toFixed(2)}%` : '–'}
              </button>
            </div>
            <div className={`w-px h-6 ${METRIC_DIVIDER}`} />
            <div className="flex-1 flex items-center justify-between min-w-0">
              <p className={`text-xs ${TEXT_TERTIARY}`}>Network</p>
              <button
                type="button"
                onClick={() => openMetricModal(server, 'network')}
                className={`text-xs font-mono rounded px-1.5 py-0.5 -mx-1.5 transition-colors leading-tight ${METRIC_VALUE}`}
                title="Open network history"
              >
                {server.networkIn !== undefined ? (
                  <span className="flex flex-col items-end">
                    <span><span className="text-cyan-500 dark:text-cyan-400">↑</span> {formatNetworkSpeed(server.networkIn)}</span>
                    <span><span className="text-blue-500 dark:text-blue-400">↓</span> {formatNetworkSpeed(server.networkOut)}</span>
                  </span>
                ) : '–'}
              </button>
            </div>
          </div>
        </>
      ))}

      <div className="flex gap-2 mb-3">
        {isUpLike ? (
          <AppButton
            disabled={!canTriggerPowerAction}
            onClick={() => onConfirmAction(server.id, server.name, 'stop')}
            className={`${POWER_BASE} ${
              canTriggerPowerAction
                ? 'bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border-red-600/30 hover:border-red-600'
                : POWER_DISABLED
            }`}
          >
            <Square className="w-4 h-4" />
            Stop
          </AppButton>
        ) : isDownLike ? (
          <AppButton
            disabled={!canTriggerPowerAction}
            onClick={() => onConfirmAction(server.id, server.name, 'start')}
            className={`${POWER_BASE} ${
              canTriggerPowerAction
                ? 'bg-green-600/10 hover:bg-green-600 text-green-400 hover:text-white border-green-600/30 hover:border-green-600'
                : POWER_DISABLED
            }`}
          >
            <Play className="w-4 h-4" />
            Start
          </AppButton>
        ) : normalizedStatus === 'stopping' ? (
          <AppButton disabled className={`${POWER_BASE} ${POWER_DISABLED}`}>
            <Square className="w-4 h-4" />
            Stopping
          </AppButton>
        ) : normalizedStatus === 'restarting' ? (
          <AppButton disabled className={`${POWER_BASE} ${POWER_DISABLED}`}>
            <RotateCw className="w-4 h-4" />
            Restarting
          </AppButton>
        ) : isInstalling ? (
          <AppButton
            disabled={!canPowerServer}
            onClick={() => onConfirmAction(server.id, server.name, 'stop')}
            className={`${POWER_BASE} ${
              canPowerServer
                ? 'bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border-red-600/30 hover:border-red-600'
                : POWER_DISABLED
            }`}
            title="Stop installation"
          >
            <Square className="w-4 h-4" />
            Stop
          </AppButton>
        ) : (
          <AppButton disabled className={`${POWER_BASE} ${POWER_DISABLED}`}>
            <Play className="w-4 h-4" />
            {isCreating ? 'Creating…' : 'Starting'}
          </AppButton>
        )}
        <AppButton
          disabled={!canPowerServer || isCreating || isInstalling || isTransitioning}
          onClick={() => onConfirmAction(server.id, server.name, 'restart')}
          className={`${POWER_BASE} ${
            canPowerServer && !isCreating && !isInstalling && !isTransitioning
              ? 'bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border-orange-600/30 hover:border-orange-600'
              : POWER_DISABLED
          }`}
          title={isCreating || isInstalling || isTransitioning ? `Unavailable while ${statusLabel.toLowerCase()}` : 'Restart'}
        >
          <RotateCw className="w-4 h-4" />
          Restart
        </AppButton>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <AppButton
          disabled={!canOpenSettings}
          onClick={() => handleOpenSettings(server)}
          className={`gp-btn-settings flex items-center justify-center gap-1 py-2 rounded text-sm transition-colors ${
            canOpenSettings ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
        </AppButton>
        <AppButton
          disabled={!canReadLogs}
          onClick={() => onAction(server.id, server.name, 'console')}
          className={`gp-btn-console-mobile flex items-center justify-center gap-1 py-2 rounded text-sm transition-colors whitespace-nowrap ${
            canReadLogs ? 'bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white' : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Log/Console
        </AppButton>
      </div>

      <div className="flex gap-2">
        <AppButton
          disabled={!canDeleteServer}
          onClick={() => onConfirmAction(server.id, server.name, 'delete')}
          aria-label="Delete server"
          className={`gp-btn-delete px-4 py-2 rounded text-sm transition-colors ${
            canDeleteServer ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Trash2 className="w-4 h-4" />
        </AppButton>
      </div>
    </div>
  );
}
