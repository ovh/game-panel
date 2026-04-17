import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CLIMessage } from '../../types/cli';
import type { GameServer } from '../../types/gameServer';
import { apiClient } from '../../utils/api';
import { isServerRunningStatus, isServerStoppedStatus } from '../../utils/serverRuntime';

type CliMessageLevel = 'success' | 'error' | 'info' | 'warning';
type AddCliMessage = (
  type: CliMessageLevel,
  message: string,
  server?: string,
  action?: string
) => void;
type CanAccessServer = (serverId: string | number, permission: string) => boolean;
type ResolveServerName = (serverId: number | string, fallback?: string) => string;

export interface InstallGameHandlerPayload {
  gameKey: string;
  serverName: string;
  gameServerName: string;
  ports?: any;
  portLabels?: { tcp?: Record<string, string>; udp?: Record<string, string> };
  healthcheck?: { type: string; port?: number; name?: string };
  requireSteamCredentials?: boolean;
  steamUsername?: string;
  steamPassword?: string;
}

interface CreateDeleteServerHandlerDeps {
  gameServers: GameServer[];
  canAccessServer: CanAccessServer;
  addCLIMessage: AddCliMessage;
  removeServerFromUi: (serverId: string) => void;
}

export const createDeleteServerHandler =
  ({ gameServers, canAccessServer, addCLIMessage, removeServerFromUi }: CreateDeleteServerHandlerDeps) =>
  async (id: string) => {
    const server = gameServers.find((s) => s.id === id);
    if (!canAccessServer(id, 'server.delete')) {
      addCLIMessage('error', 'Permission denied: server.delete is required.', server?.name);
      return;
    }
    try {
      await apiClient.deleteServer(parseInt(id, 10));
      removeServerFromUi(id);
      addCLIMessage('success', `Server ${server?.name} deleted`, server?.name, 'delete');
    } catch (error: any) {
      addCLIMessage('error', error.response?.data?.error || 'Failed to delete server', server?.name);
    }
  };

interface CreateInstallGameHandlerDeps {
  canInstallServers: boolean;
  addCLIMessage: AddCliMessage;
  setInstalling: Dispatch<SetStateAction<boolean>>;
  setInstallError: Dispatch<SetStateAction<string | null>>;
  setInstallServerId: Dispatch<SetStateAction<number | null>>;
  setInstallProgressPercent: Dispatch<SetStateAction<number | null>>;
  setInstallStatus: Dispatch<SetStateAction<string | null>>;
  refreshInstallPermissions: () => Promise<void>;
}

export const createInstallGameHandler =
  ({
    canInstallServers,
    addCLIMessage,
    setInstalling,
    setInstallError,
    setInstallServerId,
    setInstallProgressPercent,
    setInstallStatus,
    refreshInstallPermissions,
  }: CreateInstallGameHandlerDeps) =>
  async ({
    gameKey,
    serverName,
    gameServerName,
    ports,
    portLabels,
    healthcheck,
    requireSteamCredentials,
    steamUsername,
    steamPassword,
  }: InstallGameHandlerPayload) => {
    if (!canInstallServers) {
      addCLIMessage(
        'error',
        'Permission denied: server.install global permission is required.',
        'System',
        'install'
      );
      return;
    }
    setInstalling(true);
    setInstallError(null);
    setInstallServerId(null);
    setInstallProgressPercent(0);
    setInstallStatus('pending');
    try {
      addCLIMessage('info', `[INSTALL] Starting installation of ${gameKey}...`, serverName, 'install');
      addCLIMessage('info', `[INSTALL] Server Name: ${serverName}`, serverName, 'install');
      addCLIMessage('info', `[INSTALL] Game: ${gameKey}`, serverName, 'install');
      addCLIMessage('info', '[INSTALL] Downloading LinuxGSM script...', serverName, 'install');

      const startTime = Date.now();
      addCLIMessage('info', '[API] Calling backend API: POST /api/servers/install', serverName, 'install');

      const response = await apiClient.installServer(
        gameKey,
        serverName,
        gameServerName,
        ports,
        portLabels,
        healthcheck,
        requireSteamCredentials,
        steamUsername,
        steamPassword
      );
      void refreshInstallPermissions();

      const createdId = response?.server?.id ?? response?.id;
      if (createdId) {
        const newServerId = Number(createdId);
        setInstallServerId(newServerId);
        apiClient.subscribeInstall(newServerId);
        addCLIMessage(
          'info',
          `[WS] Subscribed to install progress (server ID ${newServerId})`,
          serverName,
          'install'
        );
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      addCLIMessage('info', `[TIMER] Installation request accepted in ${duration}s`, serverName, 'install');
      addCLIMessage('info', '[INSTALL] Awaiting real-time install updates...', serverName, 'install');
      addCLIMessage('info', `[INSTALL] Server ID: ${createdId ?? 'N/A'}`, serverName, 'install');
    } catch (error: any) {
      addCLIMessage(
        'error',
        `[ERROR] Installation failed: ${error.response?.data?.error || error.message}`,
        serverName,
        'install'
      );
      if (error.response?.data?.details) {
        addCLIMessage('error', `Details: ${error.response.data.details}`, serverName, 'install');
      }
      setInstallError(error.response?.data?.error || error.message);
      setInstallStatus('failed');
      setInstalling(false);
    }
  };

interface CreateServerActionHandlerDeps {
  canAccessServer: CanAccessServer;
  addCLIMessage: AddCliMessage;
  openConsoleTabs: string[];
  setOpenConsoleTabs: Dispatch<SetStateAction<string[]>>;
  setActiveConsoleTab: Dispatch<SetStateAction<string | null>>;
  openServerConsole: (serverId: number) => void;
  setConsoleReadyByServer: Dispatch<SetStateAction<Record<string, boolean | null>>>;
  consoleReadyRef: MutableRefObject<Record<string, boolean | null>>;
  serverLogHistoryLimit: number;
}

export const createServerActionHandler =
  ({
    canAccessServer,
    addCLIMessage,
    openConsoleTabs,
    setOpenConsoleTabs,
    setActiveConsoleTab,
    openServerConsole,
    setConsoleReadyByServer,
    consoleReadyRef,
    serverLogHistoryLimit,
  }: CreateServerActionHandlerDeps) =>
  async (serverId: string, serverName: string, action: string) => {
    try {
      const startTime = Date.now();
      addCLIMessage('info', `[ACTION] Executing ${action} on ${serverName}...`, serverName, action);

      if (
        (action === 'start' || action === 'stop' || action === 'restart') &&
        !canAccessServer(serverId, 'server.power')
      ) {
        addCLIMessage(
          'error',
          '[ERROR] Permission denied: server.power is required.',
          serverName,
          action
        );
        return;
      }
      if (action === 'console' && !canAccessServer(serverId, 'server.logs.read')) {
        addCLIMessage(
          'error',
          '[ERROR] Permission denied: server.logs.read is required.',
          serverName,
          action
        );
        return;
      }

      switch (action) {
        case 'start': {
          await apiClient.startServer(parseInt(serverId, 10));
          const startDuration = ((Date.now() - startTime) / 1000).toFixed(2);
          addCLIMessage(
            'success',
            `[OK] Server ${serverName} started (${startDuration}s)`,
            serverName,
            'start'
          );
          if (openConsoleTabs.includes(serverId)) {
            setTimeout(() => {
              apiClient.subscribeLogs(parseInt(serverId, 10), serverLogHistoryLimit);
            }, 2000);
          }
          break;
        }

        case 'stop': {
          await apiClient.stopServer(parseInt(serverId, 10));
          apiClient.unsubscribeLogs(parseInt(serverId, 10));
          consoleReadyRef.current[serverId] = false;
          setConsoleReadyByServer((prev) => ({
            ...prev,
            [serverId]: false,
          }));
          const stopDuration = ((Date.now() - startTime) / 1000).toFixed(2);
          addCLIMessage(
            'success',
            `[OK] Server ${serverName} stopped (${stopDuration}s)`,
            serverName,
            'stop'
          );
          break;
        }

        case 'debug': {
          if (!canAccessServer(serverId, 'server.logs.read')) {
            addCLIMessage(
              'error',
              '[ERROR] Permission denied: server.logs.read is required.',
              serverName,
              'debug'
            );
            break;
          }
          addCLIMessage('info', `[WS] WebSocket: subscribe logs for ${serverName}`, serverName, 'debug');
          apiClient.subscribeLogs(parseInt(serverId, 10), serverLogHistoryLimit);
          setActiveConsoleTab(serverId);
          if (!openConsoleTabs.includes(serverId)) {
            setOpenConsoleTabs([...openConsoleTabs, serverId]);
          }
          break;
        }

        case 'console':
          addCLIMessage('info', 'Subscribing to logs via WebSocket...', serverName, 'console');
          openServerConsole(parseInt(serverId, 10));
          break;

        case 'restart': {
          apiClient.unsubscribeLogs(parseInt(serverId, 10));
          await apiClient.restartServer(parseInt(serverId, 10));
          const restartDuration = ((Date.now() - startTime) / 1000).toFixed(2);
          addCLIMessage(
            'success',
            `[OK] Server ${serverName} restarting... (${restartDuration}s)`,
            serverName,
            'restart'
          );
          if (openConsoleTabs.includes(serverId)) {
            setTimeout(() => {
              apiClient.subscribeLogs(parseInt(serverId, 10), serverLogHistoryLimit);
            }, 2000);
          }
          break;
        }

        default:
          addCLIMessage('warning', `[WARN] Action ${action} not implemented`, serverName, action);
      }
    } catch (error: any) {
      addCLIMessage(
        'error',
        `[ERROR] API Error: ${error.response?.data?.error || error.message}`,
        serverName,
        action
      );
      if (error.response?.status) {
        addCLIMessage(
          'error',
          `HTTP ${error.response.status}: ${error.response.statusText}`,
          serverName,
          action
        );
      }
    }
  };

interface CreateRenameServerHandlerDeps {
  setGameServers: Dispatch<SetStateAction<GameServer[]>>;
  addCLIMessage: AddCliMessage;
  resolveServerName: ResolveServerName;
}

export const createRenameServerHandler =
  ({ setGameServers, addCLIMessage, resolveServerName }: CreateRenameServerHandlerDeps) =>
  async (id: string, newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    try {
      await apiClient.updateServer(Number(id), { serverName: trimmedName });
      setGameServers((prev) =>
        prev.map((server) => (server.id === id ? { ...server, name: trimmedName } : server))
      );
      addCLIMessage(
        'success',
        `[OK] Server renamed to "${trimmedName}"`,
        resolveServerName(id, trimmedName),
        'rename'
      );
    } catch (error: any) {
      addCLIMessage(
        'error',
        error.response?.data?.error || 'Failed to rename server',
        resolveServerName(id),
        'rename'
      );
    }
  };

interface CreateRefreshServerSnapshotHandlerDeps {
  addCLIMessage: AddCliMessage;
}

export const createRefreshServerSnapshotHandler =
  ({ addCLIMessage }: CreateRefreshServerSnapshotHandlerDeps) =>
  async () => {
    try {
      addCLIMessage('info', 'Refreshing server list...', 'System', 'refresh');
      apiClient.subscribeServers();
      addCLIMessage('success', 'Servers refreshed successfully!', 'System', 'refresh');
    } catch (error: any) {
      addCLIMessage(
        'error',
        error.response?.data?.error || 'Failed to refresh servers',
        'System',
        'refresh'
      );
    }
  };

interface CreateStartAllHandlerDeps {
  gameServers: GameServer[];
  setGameServers: Dispatch<SetStateAction<GameServer[]>>;
  setCliMessages: Dispatch<SetStateAction<CLIMessage[]>>;
}

export const createStartAllHandler =
  ({ gameServers, setGameServers, setCliMessages }: CreateStartAllHandlerDeps) =>
  () => {
    const affectedServers = gameServers.filter((server) => isServerStoppedStatus(server.status));
    setGameServers(
      gameServers.map((server) => ({
        ...server,
        status: isServerStoppedStatus(server.status) ? 'starting' : server.status,
      }))
    );

    const timestamp = new Date().toISOString();
    const newMessage: CLIMessage = {
      id: Date.now().toString(),
      timestamp,
      server: 'System',
      action: 'start-all',
      message: `[OK] Starting all servers...\n  ${affectedServers.length} server(s) marked as starting.`,
      type: 'success',
    };
    setCliMessages((prev) => [...prev, newMessage]);
  };

interface CreateStopAllHandlerDeps {
  gameServers: GameServer[];
  setGameServers: Dispatch<SetStateAction<GameServer[]>>;
  setCliMessages: Dispatch<SetStateAction<CLIMessage[]>>;
}

export const createStopAllHandler =
  ({ gameServers, setGameServers, setCliMessages }: CreateStopAllHandlerDeps) =>
  () => {
    const affectedServers = gameServers.filter((server) => isServerRunningStatus(server.status));
    setGameServers(
      gameServers.map((server) => ({
        ...server,
        status: isServerRunningStatus(server.status) ? 'stopping' : server.status,
      }))
    );

    const timestamp = new Date().toISOString();
    const newMessage: CLIMessage = {
      id: Date.now().toString(),
      timestamp,
      server: 'System',
      action: 'stop-all',
      message: `[OK] Stopping all servers...\\n  ${affectedServers.length} server(s) marked as stopping.`,
      type: 'warning',
    };
    setCliMessages((prev) => [...prev, newMessage]);
  };
