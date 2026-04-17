import {
  Check,
  Edit2,
  Play,
  Plus,
  RotateCw,
  Settings,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type { GameServer } from '../../types/gameServer';
import type { AuthUser } from '../../utils/permissions';
import { PUBLIC_CONNECTION_HOST } from '../../utils/api';
import {
  isServerRunningStatus,
  isServerStoppedStatus,
  isServerTransitioningStatus,
} from '../../utils/serverRuntime';
import { canOpenServerSettings, hasServerPermission, type MetricType } from './utils';
import { getServerStatusPresentation } from './utils';
import { AppButton, AppInput } from '../../src/ui/components';

type ConfirmServerAction = 'start' | 'stop' | 'restart' | 'delete';

interface GameServersMobileListProps {
  filteredAndSortedServers: GameServer[];
  terminalReadyByServer?: Record<string, boolean | null>;
  consoleBlinkByServer: Record<string, boolean>;
  currentUser?: AuthUser | null;
  permissionsByServer?: Record<string, string[]>;
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
  openMetricModal: (server: GameServer, metric: MetricType) => void;
  onConfirmAction: (serverId: string, serverName: string, action: ConfirmServerAction) => void;
  handleOpenSettings: (server: GameServer) => void;
  onAction: (serverId: string, serverName: string, action: string) => void;
  onOpenConsoleTerminal: (serverId: string, serverName: string) => void;
  canOpenInstallModal: boolean;
  canInstall: boolean;
  onOpenInstallModal?: () => void;
}

export function GameServersMobileList({
  filteredAndSortedServers,
  terminalReadyByServer,
  consoleBlinkByServer,
  currentUser,
  permissionsByServer,
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
  onConfirmAction,
  handleOpenSettings,
  onAction,
  onOpenConsoleTerminal,
  canOpenInstallModal,
  canInstall,
  onOpenInstallModal,
}: GameServersMobileListProps) {
  return (
    <div className="lg:hidden space-y-3">
      {filteredAndSortedServers.map((server) => {
        const { normalizedStatus, label: statusLabel, className: statusClassName } =
          getServerStatusPresentation(server.status);
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
          <div key={server.id} className={`bg-[#1f2937] rounded-lg p-4 border ${rowBorder}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                {editingId === server.id ? (
                  <div className="flex items-center gap-2">
                    <AppInput
                      type="text"
                      value={editValue}
                      onChange={(event) => setEditValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleSaveEdit(server.id);
                        if (event.key === 'Escape') handleCancelEdit();
                      }}
                      className={`flex-1 ${inputBg} border ${inputBorder} rounded px-2 py-1 text-sm ${textPrimary} focus:outline-none focus:border-[#0050D5]`}
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
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold ${textPrimary}`}>{server.name}</h3>
                    <AppButton
                      onClick={() => {
                        if (!canRenameServer) return;
                        handleStartEdit(server);
                      }}
                      disabled={!canRenameServer}
                      className={
                        canRenameServer
                          ? 'text-gray-400 hover:text-[var(--color-cyan-400)]'
                          : 'text-gray-600 cursor-not-allowed'
                      }
                    >
                      <Edit2 className="w-4 h-4" />
                    </AppButton>
                  </div>
                )}
                <p className={`text-sm ${textSecondary} mt-1`}>{getGameLabel(server.game)}</p>
                <div className="mt-2">
                  {server.port ? (
                    <AppButton
                      type="button"
                      tone="ghost"
                      onClick={() => openConnectionModal(server)}
                      className="rounded border-none bg-transparent px-2 py-1 text-xs font-mono text-cyan-400 transition-colors hover:bg-gray-700/60 hover:text-[var(--color-cyan-400)]"
                      title="Open ports list"
                    >
                      {PUBLIC_CONNECTION_HOST}:{server.port}
                    </AppButton>
                  ) : (
                    <p className={`text-xs ${textTertiary}`}>Connection: -</p>
                  )}
                </div>
              </div>
              <AppButton
                type="button"
                onClick={() => openHistoryModal(server, canReadLogs)}
                disabled={!canReadLogs}
                title={canReadLogs ? 'Open history logs' : 'Missing permission: server.logs.read'}
                className={`ml-2 inline-flex min-w-[92px] items-center justify-center rounded-full border px-4 py-1 text-center text-sm font-semibold leading-none tracking-[0.04em] transition-colors ${statusClassName} ${
                  canReadLogs ? 'hover:brightness-110' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                {statusLabel}
              </AppButton>
            </div>

            {isRunning && (
              <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg border bg-gray-800 border-gray-700">
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <p className={`text-xs ${textTertiary}`}>CPU</p>
                  <AppButton
                    type="button"
                    onClick={() => openMetricModal(server, 'cpu')}
                    className={`text-sm font-semibold ${textPrimary} rounded px-1.5 py-0.5 -mx-1.5 hover:bg-gray-700 hover:text-[var(--color-cyan-400)] transition-colors`}
                    title="Open CPU history"
                  >
                    {server.cpuUsage !== undefined ? `${server.cpuUsage.toFixed(2)}%` : 'Loading'}
                  </AppButton>
                </div>
                <div className="w-px h-6 bg-gray-700" />
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <p className={`text-xs ${textTertiary}`}>Memory</p>
                  <AppButton
                    type="button"
                    onClick={() => openMetricModal(server, 'memory')}
                    className={`text-sm font-semibold ${textPrimary} rounded px-1.5 py-0.5 -mx-1.5 hover:bg-gray-700 hover:text-[var(--color-cyan-400)] transition-colors`}
                    title="Open memory history"
                  >
                    {server.memoryUsage !== undefined
                      ? `${server.memoryUsage.toFixed(2)}%`
                      : 'Loading'}
                  </AppButton>
                </div>
              </div>
            )}

            <div className="flex gap-2 mb-3">
              {isRunning ? (
                <AppButton
                  disabled={!canTriggerPowerAction}
                  onClick={() => onConfirmAction(server.id, server.name, 'stop')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border shadow-sm ${
                    canTriggerPowerAction
                      ? 'bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border-red-600/30 hover:border-red-600'
                      : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                  }`}
                >
                  <Square className="w-4 h-4" />
                  Stop
                </AppButton>
              ) : isStopped ? (
                <AppButton
                  disabled={!canTriggerPowerAction}
                  onClick={() => onConfirmAction(server.id, server.name, 'start')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border shadow-sm ${
                    canTriggerPowerAction
                      ? 'bg-green-600/10 hover:bg-green-600 text-green-400 hover:text-white border-green-600/30 hover:border-green-600'
                      : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                  }`}
                >
                  <Play className="w-4 h-4" />
                  Start
                </AppButton>
              ) : normalizedStatus === 'stopping' ? (
                <AppButton
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border shadow-sm bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed"
                >
                  <Square className="w-4 h-4" />
                  Stopping
                </AppButton>
              ) : normalizedStatus === 'restarting' ? (
                <AppButton
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border shadow-sm bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed"
                >
                  <RotateCw className="w-4 h-4" />
                  Restarting
                </AppButton>
              ) : (
                <AppButton
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border shadow-sm bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed"
                >
                  <Play className="w-4 h-4" />
                  {normalizedStatus === 'installing' ? 'Installing' : 'Starting'}
                </AppButton>
              )}
              <AppButton
                disabled={!canPowerServer || isTransitioning}
                onClick={() => onConfirmAction(server.id, server.name, 'restart')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border shadow-sm ${
                  canPowerServer && !isTransitioning
                    ? 'bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border-orange-600/30 hover:border-orange-600'
                    : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                }`}
                title={isTransitioning ? `Unavailable while ${statusLabel.toLowerCase()}` : 'Restart'}
              >
                <RotateCw className="w-4 h-4" />
                Restart
              </AppButton>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <AppButton
                disabled={!canOpenSettings}
                onClick={() => handleOpenSettings(server)}
                className={`flex items-center justify-center gap-1 py-2 rounded text-sm transition-colors ${
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
                className={`flex items-center justify-center gap-1 py-2 rounded text-sm transition-colors ${
                  canReadLogs
                    ? 'bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white'
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Terminal className="w-4 h-4" />
                Logs
              </AppButton>
              <div className="relative">
                <AppButton
                  onClick={() => {
                    onOpenConsoleTerminal(server.id, server.name);
                  }}
                  disabled={!isConsoleReady || !canUseConsole}
                  className={`flex items-center justify-center gap-1 py-2 rounded text-sm transition-colors border ${
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

            <div className="flex gap-2">
              <AppButton
                disabled={!canDeleteServer}
                onClick={() => onConfirmAction(server.id, server.name, 'delete')}
                className={`px-4 py-2 rounded text-sm transition-colors ${
                  canDeleteServer
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </AppButton>
            </div>
          </div>
        );
      })}

      <div className={`bg-[#1f2937] rounded-lg p-4 border ${rowBorder}`}>
        <div className="flex justify-center">
          <AppButton
            type="button"
            onClick={() => {
              if (!canOpenInstallModal) return;
              onOpenInstallModal?.();
            }}
            disabled={!canOpenInstallModal}
            className={`group inline-flex min-w-[240px] items-center justify-center gap-2 rounded-md border-2 px-6 py-2 font-semibold transition-all ${
              canOpenInstallModal
                ? 'border-[var(--color-cyan-400)]/45 bg-[#0050D7]/10 text-[var(--color-cyan-400)] hover:bg-[#157EEA]/20 hover:border-[var(--color-cyan-400)] hover:text-white'
                : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
            }`}
            title={canInstall ? 'Install game server' : 'Missing permission: server.install'}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center text-[var(--color-cyan-400)] group-hover:text-white transition-colors">
              <Plus className="h-5 w-5 stroke-[3]" />
            </span>
            <span>Add Game Server</span>
          </AppButton>
        </div>
      </div>
    </div>
  );
}



