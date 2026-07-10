import type { Dispatch, SetStateAction } from 'react';
import type { CLIMessage } from '../../types/cli';
import type { GameServer } from '../../types/gameServer';
import { apiClient } from '../../utils/api';
import { isServerUpLike, isServerDownLike } from '../../utils/serverRuntime';
import { nextId } from '../../utils/uid';

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
  provider: 'ovhcloud' | 'linuxgsm' | 'external';
  name: string;
  shortname?: string;
  imageId?: string;
  dockerImage?: string;
  imageOptions?: { patchline?: string; profileUuid?: string | null };
  runtimeIdentity?: { user: string; uid: number; gid: number };
  ports: {
    tcp: { host: number; container: number; label: string }[];
    udp: { host: number; container: number; label: string }[];
  };
  healthcheck: null | { mode: 'disabled' } | { mode: 'override'; type: string; port?: number; interval?: number; timeout?: number; retries?: number; startPeriod?: number };
  mounts?: { key: string; containerPath: string }[];
  env?: Record<string, string>;
  requireSteamCredentials?: boolean;
  steamUsername?: string;
  steamPassword?: string;
  resourceLimits?: { memoryMb: number; cpu: number } | null;
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
      addCLIMessage('error', "You don't have permission to delete this server", server?.name);
      return;
    }
    try {
      await apiClient.deleteServer(parseInt(id, 10));
      removeServerFromUi(id);
      addCLIMessage('success', `${server?.name} was deleted`, server?.name, 'delete');
    } catch (error: any) {
      addCLIMessage('error', error.response?.data?.error || 'Failed to delete server', server?.name);
    }
  };

import type { InstallStep } from '../../types/gameServer';

interface CreateInstallGameHandlerDeps {
  canInstallServers: boolean;
  addCLIMessage: AddCliMessage;
  setInstalling: Dispatch<SetStateAction<boolean>>;
  setInstallError: Dispatch<SetStateAction<string | null>>;
  setInstallServerId: Dispatch<SetStateAction<number | null>>;
  setInstallProgressPercent: Dispatch<SetStateAction<number | null>>;
  setInstallStatus: Dispatch<SetStateAction<string | null>>;
  setInstallPlan: Dispatch<SetStateAction<InstallStep[]>>;
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
    setInstallPlan,
    refreshInstallPermissions,
  }: CreateInstallGameHandlerDeps) =>
  async (payload: InstallGameHandlerPayload) => {
    const { name } = payload;
    if (!canInstallServers) {
      addCLIMessage(
        'error',
        "You don't have permission to install servers",
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
    setInstallPlan([]);
    try {
      addCLIMessage('info', `Installing ${name}...`, name, 'install');

      const response = await apiClient.installServer(payload);
      void refreshInstallPermissions();

      const createdId = response?.server?.id ?? response?.id;
      if (createdId) {
        const newServerId = Number(createdId);
        setInstallServerId(newServerId);
        apiClient.subscribeInstall(newServerId);
      }
    } catch (error: any) {
      addCLIMessage(
        'error',
        `Installation failed: ${error.response?.data?.error || error.message}`,
        name,
        'install'
      );
      if (error.response?.data?.details) {
        addCLIMessage('error', error.response.data.details, name, 'install');
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
    serverLogHistoryLimit,
  }: CreateServerActionHandlerDeps) =>
  async (serverId: string, serverName: string, action: string) => {
    try {
      if (
        (action === 'start' || action === 'stop' || action === 'restart') &&
        !canAccessServer(serverId, 'server.power')
      ) {
        addCLIMessage(
          'error',
          "You don't have permission to control this server",
          serverName,
          action
        );
        return;
      }
      if (action === 'console' && !canAccessServer(serverId, 'container.logs.read')) {
        addCLIMessage(
          'error',
          "You don't have permission to view this server's logs",
          serverName,
          action
        );
        return;
      }

      switch (action) {
        case 'start': {
          await apiClient.startServer(parseInt(serverId, 10));
          addCLIMessage('success', `${serverName} started`, serverName, 'start');
          break;
        }

        case 'stop': {
          await apiClient.stopServer(parseInt(serverId, 10));
          addCLIMessage('success', `${serverName} stopped`, serverName, 'stop');
          break;
        }

        case 'debug': {
          if (!canAccessServer(serverId, 'container.logs.read')) {
            addCLIMessage(
              'error',
              "You don't have permission to view this server's logs",
              serverName,
              'debug'
            );
            break;
          }
          apiClient.subscribeLogs(parseInt(serverId, 10), serverLogHistoryLimit);
          setActiveConsoleTab(serverId);
          if (!openConsoleTabs.includes(serverId)) {
            setOpenConsoleTabs([...openConsoleTabs, serverId]);
          }
          break;
        }

        case 'console':
          openServerConsole(parseInt(serverId, 10));
          break;

        case 'restart': {
          await apiClient.restartServer(parseInt(serverId, 10));
          addCLIMessage('success', `${serverName} is restarting...`, serverName, 'restart');
          break;
        }

        default:
          break;
      }
    } catch (error: any) {
      addCLIMessage(
        'error',
        `Action failed: ${error.response?.data?.error || error.message}`,
        serverName,
        action
      );
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
      await apiClient.updateServer(Number(id), { name: trimmedName });
      setGameServers((prev) =>
        prev.map((server) => (server.id === id ? { ...server, name: trimmedName } : server))
      );
      addCLIMessage(
        'success',
        `Server renamed to "${trimmedName}"`,
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
      apiClient.subscribeServers();
      addCLIMessage('success', 'Server list refreshed', 'System', 'refresh');
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
    const affectedServers = gameServers.filter((server) => isServerDownLike(server.status));
    setGameServers(
      gameServers.map((server) => ({
        ...server,
        status: isServerDownLike(server.status) ? 'starting' : server.status,
      }))
    );

    const timestamp = new Date().toISOString();
    const newMessage: CLIMessage = {
      id: String(nextId()),
      timestamp,
      server: 'System',
      action: 'start-all',
      message: `Starting all servers... (${affectedServers.length} server${affectedServers.length !== 1 ? 's' : ''})`,
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
    const affectedServers = gameServers.filter((server) => isServerUpLike(server.status));
    setGameServers(
      gameServers.map((server) => ({
        ...server,
        status: isServerUpLike(server.status) ? 'stopping' : server.status,
      }))
    );

    const timestamp = new Date().toISOString();
    const newMessage: CLIMessage = {
      id: String(nextId()),
      timestamp,
      server: 'System',
      action: 'stop-all',
      message: `Stopping all servers... (${affectedServers.length} server${affectedServers.length !== 1 ? 's' : ''})`,
      type: 'warning',
    };
    setCliMessages((prev) => [...prev, newMessage]);
  };
