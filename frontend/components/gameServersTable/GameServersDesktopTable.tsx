import type { ReactNode } from 'react';
import {
  AlertCircle,
  Settings,
  Trash2,
  Edit2,
  Check,
  X,
  Play,
  Square,
  RotateCw,
  Terminal,
  Plus,
  Copy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { GameServer } from '../../types/gameServer';
import type { AuthUser } from '../../utils/permissions';
import { AppButton, AppInput, AppTable } from '../../src/ui/components';
import {
  isServerRunningStatus,
  isServerStoppedStatus,
  isServerTransitioningStatus,
} from '../../utils/serverRuntime';
import {
  type MetricType,
  type SortField,
  type SortOrder,
  canOpenServerSettings,
  getServerStatusPresentation,
  hasServerPermission,
} from './utils';

interface ConfirmActionState {
  show: boolean;
  serverId: string;
  serverName: string;
  action: 'start' | 'stop' | 'restart' | 'stopAll' | 'startAll' | 'delete';
}

interface GameServersDesktopTableProps {
  filteredAndSortedServers: GameServer[];
  terminalReadyByServer?: Record<string, boolean | null>;
  consoleBlinkByServer: Record<string, boolean>;
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
  getGameLabel: (gameKey: string) => string;
  openConnectionModal: (server: GameServer) => void;
  openHistoryModal: (server: GameServer, canReadLogs: boolean) => void;
  renderMetricCell: (server: GameServer, metric: MetricType, value?: number) => ReactNode;
  copyConnectionAddress: (port: number) => void;
  getConnectionCopyState: (port: number) => 'idle' | 'success' | 'error';
  setConfirmAction: (state: ConfirmActionState) => void;
  handleOpenSettings: (server: GameServer) => void;
  onAction: (serverId: string, serverName: string, action: string) => void;
  onOpenConsoleTerminal: (serverId: string, serverName: string) => void;
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
  terminalReadyByServer,
  consoleBlinkByServer,
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
  renderMetricCell,
  copyConnectionAddress,
  getConnectionCopyState,
  setConfirmAction,
  handleOpenSettings,
  onAction,
  onOpenConsoleTerminal,
  canOpenInstallModal,
  canInstall,
  onOpenInstallModal,
  publicConnectionHost,
  sortField,
  sortOrder,
  handleSort,
}: GameServersDesktopTableProps) {
  const powerButtonClass =
    'inline-flex h-10 w-10 min-w-10 shrink-0 items-center justify-center rounded-lg border p-0 shadow-sm transition-all';

  return (
    <div className="hidden lg:block overflow-x-auto">
      <AppTable className="gp-game-servers-table w-full">
        <thead>
          <tr className={`border-b ${borderColor}`}>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>
              <AppButton
                onClick={() => handleSort('name')}
                tone="ghost"
                className="flex h-auto items-center gap-2 border-none bg-transparent p-0 text-inherit hover:text-[var(--color-cyan-400)]"
              >
                Server Name
                {getSortIcon(sortField, sortOrder, 'name')}
              </AppButton>
            </th>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>
              <AppButton
                onClick={() => handleSort('game')}
                tone="ghost"
                className="flex h-auto items-center gap-2 border-none bg-transparent p-0 text-inherit hover:text-[var(--color-cyan-400)]"
              >
                Game
                {getSortIcon(sortField, sortOrder, 'game')}
              </AppButton>
            </th>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>Connection</th>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>
              <AppButton
                onClick={() => handleSort('status')}
                tone="ghost"
                className="flex h-auto items-center gap-2 border-none bg-transparent p-0 text-inherit hover:text-[var(--color-cyan-400)]"
              >
                Status
                {getSortIcon(sortField, sortOrder, 'status')}
              </AppButton>
            </th>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>CPU</th>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>Memory</th>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>Power</th>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>Management</th>
            <th className={`text-left ${textTertiary} text-sm py-3 px-4`}>Delete</th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSortedServers.map((server) => {
            const { normalizedStatus, label: statusLabel, className: statusClassName } =
              getServerStatusPresentation(server.status);
            const connectionCopyState = server.port ? getConnectionCopyState(server.port) : 'idle';
            const consoleReadyState = terminalReadyByServer?.[server.id];
            const isConsoleReady =
              consoleReadyState === true ||
              (consoleReadyState == null && isServerRunningStatus(server.status));
            const shouldBlinkConsole = Boolean(consoleBlinkByServer[server.id]);
            const isRunning = isServerRunningStatus(server.status);
            const isStopped = isServerStoppedStatus(server.status);
            const isTransitioning = isServerTransitioningStatus(server.status);
            const canPowerServer = hasServerPermission(
              currentUser,
              permissionsByServer,
              server.id,
              'server.power'
            );
            const canTriggerPowerAction = canPowerServer && !isTransitioning;
            const canReadLogs = hasServerPermission(
              currentUser,
              permissionsByServer,
              server.id,
              'server.logs.read'
            );
            const canUseConsole = hasServerPermission(
              currentUser,
              permissionsByServer,
              server.id,
              'server.console'
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
            const canOpenSettings = canOpenServerSettings(currentUser, permissionsByServer, server.id);

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
                        className="text-green-400 hover:text-green-300"
                      >
                        <Check className="w-4 h-4" />
                      </AppButton>
                      <AppButton onClick={handleCancelEdit} className="text-red-400 hover:text-red-300">
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
                <td className={`${textSecondary} py-4 px-4`}>{getGameLabel(server.game)}</td>
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
                              : 'bg-transparent text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-700/60 hover:text-[var(--color-cyan-400)]'
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
                    <span className={`${textTertiary} text-xs`}>-</span>
                  )}
                </td>
                <td className="py-4 px-4">
                  <AppButton
                    type="button"
                    onClick={() => openHistoryModal(server, canReadLogs)}
                    disabled={!canReadLogs}
                    title={canReadLogs ? 'Open history logs' : 'Missing permission: server.logs.read'}
                    className={`inline-flex min-w-[92px] items-center justify-center rounded-full border px-4 py-1 text-center text-sm font-semibold leading-none tracking-[0.04em] transition-colors ${statusClassName} ${
                      canReadLogs ? 'hover:brightness-110' : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    {statusLabel}
                  </AppButton>
                </td>
                <td className={`py-4 px-4 text-sm ${textSecondary}`}>
                  {renderMetricCell(server, 'cpu', server.cpuUsage)}
                </td>
                <td className={`py-4 px-4 text-sm ${textSecondary}`}>
                  {renderMetricCell(server, 'memory', server.memoryUsage)}
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
                    ) : (
                      <AppButton
                        disabled
                        className={`${powerButtonClass} bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed`}
                        title={normalizedStatus === 'installing' ? 'Installing' : 'Starting'}
                      >
                        <Play className="w-4 h-4" />
                      </AppButton>
                    )}
                    <AppButton
                      disabled={!canPowerServer || isTransitioning}
                      onClick={() =>
                        setConfirmAction({
                          show: true,
                          serverId: server.id,
                          serverName: server.name,
                          action: 'restart',
                        })
                      }
                      className={`${powerButtonClass} ${
                        canPowerServer && !isTransitioning
                          ? 'bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border-orange-600/30 hover:border-orange-600'
                          : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                      }`}
                      title={isTransitioning ? `Unavailable while ${statusLabel.toLowerCase()}` : 'Restart'}
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
                      className={`px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 ${
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
                      className={`px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 ${
                        canReadLogs
                          ? 'bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white'
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Terminal className="w-4 h-4" />
                      Logs
                    </AppButton>
                    <div className="relative inline-flex shrink-0">
                      <AppButton
                        onClick={() => {
                          onOpenConsoleTerminal(server.id, server.name);
                        }}
                        disabled={!isConsoleReady || !canUseConsole}
                        className={`px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 border ${
                          isConsoleReady && canUseConsole
                            ? `bg-green-600 text-white border-green-500 hover:bg-green-500 ${shouldBlinkConsole ? 'gp-ready-blink' : ''}`
                            : 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed'
                        }`}
                        title={
                          !canUseConsole
                            ? 'Missing permission: server.console'
                            : isConsoleReady
                              ? 'Open writable console terminal'
                              : 'Checking console readiness...'
                        }
                      >
                        <Terminal className="w-4 h-4" />
                        Console
                      </AppButton>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4">
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
          <tr className="gp-add-server-row h-24">
            <td className="h-24 px-4 py-0 align-middle" colSpan={9}>
              <div className="grid h-24 place-items-center">
                <AppButton
                  type="button"
                  onClick={() => {
                    if (!canOpenInstallModal) return;
                    onOpenInstallModal?.();
                  }}
                  disabled={!canOpenInstallModal}
                  className={`gp-add-server-button group inline-flex h-10 min-w-[240px] items-center justify-center gap-2 rounded-md border-2 px-6 py-0 font-semibold leading-none transition-all ${
                    canOpenInstallModal
                      ? 'border-[var(--color-cyan-400)]/45 bg-[#0050D7]/10 text-[var(--color-cyan-400)] hover:bg-[#157EEA]/20 hover:border-[var(--color-cyan-400)] hover:text-white'
                      : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                  }`}
                  title={canInstall ? 'Install game server' : 'Missing permission: server.install'}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center self-center text-[var(--color-cyan-400)] group-hover:text-white transition-colors">
                    <Plus className="h-5 w-5 stroke-[3]" />
                  </span>
                  <span className="self-center leading-none">Add Game Server</span>
                </AppButton>
              </div>
            </td>
          </tr>
        </tbody>
      </AppTable>
    </div>
  );
}



