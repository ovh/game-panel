import { useState, useEffect, useRef, useCallback } from 'react';
import { Login } from './components/Login';
import { ThemeProvider } from './contexts/ThemeContext';
import { type GameServer } from './types/gameServer';
import { apiClient } from './utils/api';
import { AppShell } from './components/app/AppShell';
import { createWebSocketMessageHandler } from './components/app/createWebSocketMessageHandler';
import { useAuthSession } from './components/app/useAuthSession';
import { useCliMessages } from './components/app/useCliMessages';
import { useInstallAutoOpenLogs } from './components/app/useInstallAutoOpenLogs';
import { useLogPromptToasts } from './components/app/useLogPromptToasts';
import {
  createDeleteServerHandler,
  createInstallGameHandler,
  createRefreshServerSnapshotHandler,
  createRenameServerHandler,
  createServerActionHandler,
  createStartAllHandler,
  createStopAllHandler,
  type InstallGameHandlerPayload,
} from './components/app/appActionHandlers';
import {
  type ConsoleTerminalTarget,
  type LogPromptRule,
  MAX_SERVER_LOG_LINES,
  SERVER_LOG_HISTORY_LIMIT,
  normalizeCatalogLogPrompts,
  normalizeGameIdentifier,
} from './components/app/appRuntime';
import {
  type LogEntry,
  type ServerHistoryById,
  type ServerHistoryEntry,
  type ServerLogs,
  type ServerMetricHistoryPoint,
  extractServerPorts,
  mapBackendStatusToUi,
} from './utils/serverRuntime';

function AppContent() {
  const {
    isAuthenticated,
    authChecking,
    authReady,
    currentUserId,
    currentUser,
    canManageUsers,
    canInstallServers,
    canAccessServer,
    serverPermissionsById,
    installPermissionsSyncing,
    loadCurrentUser,
    refreshInstallPermissions,
    resetSession,
    markAuthenticated,
  } = useAuthSession();
  const [activeTab, setActiveTab] = useState('game-servers');
  const {
    cliMessages,
    setCliMessages,
    addCliMessage: addCLIMessage,
    clearCliMessages,
  } = useCliMessages();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [serverLogs, setServerLogs] = useState<ServerLogs>({});
  const [serverHistoryById, setServerHistoryById] = useState<ServerHistoryById>({});
  const [activeConsoleTab, setActiveConsoleTab] = useState<string | null>('cli-console');
  const [openConsoleTabs, setOpenConsoleTabs] = useState<string[]>([]);
  const [consoleReadyByServer, setConsoleReadyByServer] = useState<Record<string, boolean | null>>(
    {}
  );
  const [consoleTerminalTarget, setConsoleTerminalTarget] = useState<ConsoleTerminalTarget | null>(
    null
  );

  const [gameServers, setGameServers] = useState<GameServer[]>([]);
  const [serverMetricsHistoryById, setServerMetricsHistoryById] = useState<
    Record<string, ServerMetricHistoryPoint[]>
  >({});
  const [gameNamesByKey, setGameNamesByKey] = useState<Record<string, string>>({});
  const [logPromptRules, setLogPromptRules] = useState<LogPromptRule[]>([]);
  const serversRef = useRef<GameServer[]>([]);
  const consoleReadyRef = useRef<Record<string, boolean | null>>({});
  const suppressReplayAfterClearRef = useRef<Record<string, boolean>>({});
  const lastInstallProgressLogRef = useRef<Record<number, number>>({});
  const handleWebSocketMessageRef = useRef<(message: any) => void>(() => {});
  const subscribedMetricsServerIdsRef = useRef<Set<number>>(new Set());
  const subscribedConsoleStatusServerIdsRef = useRef<Set<number>>(new Set());
  const {
    activeLogPromptToasts,
    setActiveLogPromptToasts,
    clearRecentLogPromptMatchesForServer,
    removeLogPromptToast,
    maybeCreateLogPromptToast,
  } = useLogPromptToasts({
    gameNamesByKey,
    logPromptRules,
    serversRef,
  });

  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installProgressPercent, setInstallProgressPercent] = useState<number | null>(null);
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const [installServerId, setInstallServerId] = useState<number | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const metricsServerIdsKey = gameServers
    .map((server) => server.id)
    .sort()
    .join(',');

  const loadCatalogMetadata = useCallback(async () => {
    try {
      const catalogResult = await apiClient.getCatalogGames();
      const mapping: Record<string, string> = {};
      const nextRules: LogPromptRule[] = [];
      catalogResult.games.forEach((game) => {
        mapping[game.shortname] = game.gamename;

        const prompts = normalizeCatalogLogPrompts(game.logPrompts);
        prompts.forEach((prompt) => {
          const gameKeys = Array.from(
            new Set(
              [game.shortname, game.gamename, game.gameservername]
                .map((value) => normalizeGameIdentifier(value))
                .filter(Boolean)
            )
          );
          if (!gameKeys.length) return;
          nextRules.push({
            gameKeys,
            gameName: game.gamename || game.shortname,
            title: prompt.title || 'Action required',
            match: prompt.match,
            action: prompt.action,
          });
        });
      });
      setGameNamesByKey(mapping);
      setLogPromptRules(nextRules);
    } catch {
      setGameNamesByKey({});
      setLogPromptRules([]);
    }
  }, []);

  useEffect(() => {
    serversRef.current = gameServers;
  }, [gameServers]);

  useEffect(() => {
    const activeServerIds = new Set(gameServers.map((server) => String(server.id)));
    setServerMetricsHistoryById((prev) => {
      const next: Record<string, ServerMetricHistoryPoint[]> = {};
      let changed = false;

      Object.entries(prev).forEach(([serverId, history]) => {
        if (activeServerIds.has(serverId)) {
          next[serverId] = history;
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [metricsServerIdsKey]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;

    const wsListener = (message: any) => {
      handleWebSocketMessageRef.current(message);
    };

    const connectWS = async () => {
      try {
        await apiClient.connectWebSocket(wsListener);

        apiClient.subscribeServers();
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
      }
    };

    void connectWS();

    return () => {
      apiClient.removeWebSocketListener(wsListener);
      apiClient.closeWebSocket();
    };
  }, [authReady, isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        await loadCatalogMetadata();
      } catch {
        if (cancelled) return;
      }
    };

    void refresh();

    const handleFocus = () => {
      void refresh();
    };
    const interval = window.setInterval(() => {
      void refresh();
    }, 60000);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadCatalogMetadata]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) {
      subscribedMetricsServerIdsRef.current.forEach((serverId) => {
        apiClient.unsubscribeMetrics(serverId);
      });
      subscribedMetricsServerIdsRef.current.clear();
      return;
    }

    const nextServerIds = new Set<number>();
    gameServers.forEach((server) => {
      const id = Number(server.id);
      if (!Number.isFinite(id) || id <= 0) return;
      nextServerIds.add(id);

      if (!subscribedMetricsServerIdsRef.current.has(id)) {
        apiClient.subscribeMetrics(id);
      }
    });

    subscribedMetricsServerIdsRef.current.forEach((id) => {
      if (!nextServerIds.has(id)) {
        apiClient.unsubscribeMetrics(id);
      }
    });

    subscribedMetricsServerIdsRef.current = nextServerIds;
  }, [authReady, isAuthenticated, metricsServerIdsKey]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) {
      subscribedConsoleStatusServerIdsRef.current.forEach((serverId) => {
        apiClient.unsubscribeConsoleStatus(serverId);
      });
      subscribedConsoleStatusServerIdsRef.current.clear();
      return;
    }

    const nextServerIds = new Set(gameServers.map((server) => String(server.id)));

    setConsoleReadyByServer((prev) => {
      const next: Record<string, boolean | null> = {};

      Object.keys(prev).forEach((id) => {
        if (nextServerIds.has(id)) {
          next[id] = prev[id];
        }
      });

      gameServers.forEach((server) => {
        const id = String(server.id);
        if (!(id in next)) {
          next[id] = null;
        }
      });

      return next;
    });
    const nextReadyRef: Record<string, boolean | null> = {};
    const nextConsoleSubscriptionIds = new Set<number>();
    gameServers.forEach((server) => {
      const id = Number(server.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const strId = String(id);

      nextReadyRef[strId] = consoleReadyRef.current[strId] ?? null;
      nextConsoleSubscriptionIds.add(id);

      if (!subscribedConsoleStatusServerIdsRef.current.has(id)) {
        apiClient.subscribeConsoleStatus(id);
      }
    });

    subscribedConsoleStatusServerIdsRef.current.forEach((id) => {
      if (!nextConsoleSubscriptionIds.has(id)) {
        apiClient.unsubscribeConsoleStatus(id);
      }
    });
    subscribedConsoleStatusServerIdsRef.current = nextConsoleSubscriptionIds;

    consoleReadyRef.current = nextReadyRef;
  }, [authReady, isAuthenticated, metricsServerIdsKey]);

  const resolveServerName = (serverId: number | string, fallback?: string): string => {
    if (fallback) return fallback;
    const id = String(serverId);
    const server = serversRef.current.find((s) => s.id === id);
    return server?.name || `Server ${id}`;
  };

  const focusServerLogsSection = useCallback(() => {
    setActiveTab('game-servers');
    window.setTimeout(() => {
      const logsSection = document.getElementById('server-console-logs');
      logsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, []);

  const activateServerLogsView = useCallback(
    (serverId: number) => {
      const serverIdString = String(serverId);

      apiClient.subscribeLogs(serverId, SERVER_LOG_HISTORY_LIMIT);

      if (!(serverIdString in consoleReadyRef.current)) {
        consoleReadyRef.current[serverIdString] = null;
        setConsoleReadyByServer((prev) => ({
          ...prev,
          [serverIdString]: null,
        }));
      }

      setActiveConsoleTab(serverIdString);
      setOpenConsoleTabs((prev) =>
        prev.includes(serverIdString) ? prev : [...prev, serverIdString]
      );
      focusServerLogsSection();
    },
    [focusServerLogsSection]
  );

  const openServerConsole = useCallback(
    (serverId: number) => {
      if (!canAccessServer(serverId, 'server.logs.read')) {
        addCLIMessage(
          'error',
          'Permission denied: server.logs.read is required.',
          resolveServerName(serverId),
          'console'
        );
        return;
      }

      activateServerLogsView(serverId);
    },
    [activateServerLogsView, addCLIMessage, canAccessServer, resolveServerName]
  );

  const openInstallLogs = useCallback(
    (serverId: number) => {
      activateServerLogsView(serverId);
    },
    [activateServerLogsView]
  );

  const openConsoleTerminal = (serverId: number, serverName?: string) => {
    if (!canAccessServer(serverId, 'server.console')) {
      addCLIMessage(
        'error',
        'Permission denied: server.console is required.',
        resolveServerName(serverId, serverName),
        'console-terminal'
      );
      return;
    }
    const name = resolveServerName(serverId, serverName);
    setConsoleTerminalTarget({ serverId, serverName: name });
  };

  useInstallAutoOpenLogs(installServerId, installStatus, openInstallLogs);

  const removeServerFromUi = useCallback(
    (serverId: string) => {
      const numericServerId = Number(serverId);
      if (Number.isFinite(numericServerId) && numericServerId > 0) {
        apiClient.unsubscribeLogs(numericServerId);
        apiClient.unsubscribeActions(numericServerId);
        apiClient.unsubscribeMetrics(numericServerId);
        apiClient.unsubscribeInstall(numericServerId);
        apiClient.unsubscribeConsoleStatus(numericServerId);
        subscribedMetricsServerIdsRef.current.delete(numericServerId);
        subscribedConsoleStatusServerIdsRef.current.delete(numericServerId);
      }

      setGameServers((prev) => prev.filter((server) => server.id !== serverId));
      setServerLogs((prev) => {
        if (!(serverId in prev)) return prev;
        const next = { ...prev };
        delete next[serverId];
        return next;
      });
      setServerHistoryById((prev) => {
        if (!(serverId in prev)) return prev;
        const next = { ...prev };
        delete next[serverId];
        return next;
      });
      setServerMetricsHistoryById((prev) => {
        if (!(serverId in prev)) return prev;
        const next = { ...prev };
        delete next[serverId];
        return next;
      });
      setConsoleReadyByServer((prev) => {
        if (!(serverId in prev)) return prev;
        const next = { ...prev };
        delete next[serverId];
        return next;
      });
      delete consoleReadyRef.current[serverId];
      delete suppressReplayAfterClearRef.current[serverId];
      clearRecentLogPromptMatchesForServer(serverId);
      setOpenConsoleTabs((prev) => prev.filter((id) => id !== serverId));
      setActiveConsoleTab((prev) => (prev === serverId ? 'cli-console' : prev));
      setConsoleTerminalTarget((prev) => (prev?.serverId === Number(serverId) ? null : prev));
      setActiveLogPromptToasts((prev) => prev.filter((toast) => toast.serverId !== serverId));
    },
    [clearRecentLogPromptMatchesForServer]
  );

  const normalizeRealtimeServer = useCallback((server: any, existing?: GameServer): GameServer => {
    const parsedPorts = extractServerPorts(server?.port_mappings_json, server?.port_labels_json);
    const hasParsedPorts = parsedPorts.primary !== null || parsedPorts.portMappings.tcp.length > 0;
    const primaryPort = hasParsedPorts ? parsedPorts.primary : (existing?.port ?? null);
    const portMappings = hasParsedPorts
      ? parsedPorts.portMappings
      : (existing?.portMappings ?? { tcp: [], udp: [] });
    const portLabels = hasParsedPorts
      ? parsedPorts.portLabels
      : (existing?.portLabels ?? { tcp: {}, udp: {} });
    const rawSftpUsername = server?.sftp_username;
    const rawSftpEnabled = server?.sftp_enabled;
    const sftpUsername =
      rawSftpUsername === null || rawSftpUsername === undefined
        ? (existing?.sftpUsername ?? null)
        : String(rawSftpUsername);
    const sftpEnabled =
      typeof rawSftpEnabled === 'number'
        ? rawSftpEnabled === 1
        : typeof rawSftpEnabled === 'boolean'
          ? rawSftpEnabled
          : (existing?.sftpEnabled ?? false);

    return {
      id: String(server.id),
      name: server.name,
      game: server.game_key,
      port: primaryPort ?? undefined,
      portMappings,
      portLabels,
      status: mapBackendStatusToUi(server.status),
      dockerContainerId: server.docker_container_id ?? null,
      installStatus: server.install_progress?.status ?? null,
      installProgress: server.install_progress?.progress_percent ?? null,
      sftpUsername,
      sftpEnabled,
    };
  }, []);

  const replaceServerLogs = useCallback((serverId: string, nextLogs: LogEntry[]) => {
    setServerLogs((prev) => ({
      ...prev,
      [serverId]: nextLogs.slice(-MAX_SERVER_LOG_LINES),
    }));
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'admin-users' && !canManageUsers) {
      setActiveTab('game-servers');
    }
  }, [activeTab, canManageUsers]);

  const handleLogin = () => {
    if (window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
    }
    markAuthenticated();
    void loadCurrentUser();
  };

  const handleLogout = () => {
    apiClient.logout();
    resetSession();
    setMobileMenuOpen(false);
    setGameServers([]);
    setServerLogs({});
    setServerHistoryById({});
    setServerMetricsHistoryById({});
    setConsoleReadyByServer({});
    consoleReadyRef.current = {};
    suppressReplayAfterClearRef.current = {};
    setOpenConsoleTabs([]);
    setActiveConsoleTab('cli-console');
    setConsoleTerminalTarget(null);
    setCliMessages([]);
    setActiveLogPromptToasts([]);
    setInstallServerId(null);
    setInstallProgressPercent(null);
    setInstallStatus(null);
    setInstallError(null);
    setInstalling(false);
    subscribedMetricsServerIdsRef.current.clear();
    subscribedConsoleStatusServerIdsRef.current.clear();
  };

  const handleRequestLogout = () => {
    setLogoutConfirmOpen(true);
    setMobileMenuOpen(false);
  };

  const handleOpenChangePassword = () => {
    setChangePasswordOpen(true);
    setMobileMenuOpen(false);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] text-gray-300">
        <div className="text-sm">Checking session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const handleDeleteServer = createDeleteServerHandler({
    gameServers,
    canAccessServer,
    addCLIMessage,
    removeServerFromUi,
  });

  const installGame = createInstallGameHandler({
    canInstallServers,
    addCLIMessage,
    setInstalling,
    setInstallError,
    setInstallServerId,
    setInstallProgressPercent,
    setInstallStatus,
    refreshInstallPermissions,
  });

  const handleInstallGame = async (
    gameKey: string,
    serverName: string,
    gameServerName: string,
    ports?: any,
    portLabels?: { tcp?: Record<string, string>; udp?: Record<string, string> },
    healthcheck?: { type: string; port?: number; name?: string },
    requireSteamCredentials?: boolean,
    steamUsername?: string,
    steamPassword?: string
  ) => {
    const payload: InstallGameHandlerPayload = {
      gameKey,
      serverName,
      gameServerName,
      ports,
      portLabels,
      healthcheck,
      requireSteamCredentials,
      steamUsername,
      steamPassword,
    };
    await installGame(payload);
  };

  const handleClearInstallError = () => {
    setInstallError(null);
  };

  const handleServerAction = createServerActionHandler({
    canAccessServer,
    addCLIMessage,
    openConsoleTabs,
    setOpenConsoleTabs,
    setActiveConsoleTab,
    openServerConsole,
    setConsoleReadyByServer,
    consoleReadyRef,
    serverLogHistoryLimit: SERVER_LOG_HISTORY_LIMIT,
  });

  const handleAddLog = (serverId: string, log: LogEntry) => {
    maybeCreateLogPromptToast(serverId, log.message);
    setServerLogs((prev) => ({
      ...prev,
      [serverId]: [...(prev[serverId] || []), log].slice(-MAX_SERVER_LOG_LINES),
    }));
  };

  const addServerHistoryEntries = (serverId: string, incoming: ServerHistoryEntry[]) => {
    if (!incoming.length) return;

    setServerHistoryById((prev) => {
      const current = prev[serverId] || [];
      const deduped = new Map<string, ServerHistoryEntry>();

      [...current, ...incoming].forEach((entry) => {
        const parsedTs = Date.parse(entry.timestamp);
        const normalizedTimestamp = Number.isNaN(parsedTs)
          ? entry.timestamp
          : new Date(Math.floor(parsedTs / 1000) * 1000).toISOString();
        const normalizedMessage = entry.message.replace(/\s+/g, ' ').trim();
        deduped.set(`${normalizedTimestamp}|${entry.level}|${normalizedMessage}`, entry);
      });

      const merged = Array.from(deduped.values())
        .sort((a, b) => {
          const aTime = Date.parse(a.timestamp);
          const bTime = Date.parse(b.timestamp);
          const safeATime = Number.isNaN(aTime) ? 0 : aTime;
          const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
          if (safeATime !== safeBTime) return safeATime - safeBTime;
          return a.id - b.id;
        })
        .slice(-500);

      return {
        ...prev,
        [serverId]: merged,
      };
    });
  };

  const handleWebSocketMessage = createWebSocketMessageHandler({
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
  });
  handleWebSocketMessageRef.current = handleWebSocketMessage;

  const handleClearServerLogs = (serverId: string) => {
    suppressReplayAfterClearRef.current[serverId] = true;
    clearRecentLogPromptMatchesForServer(serverId);
    setServerLogs((prev) => ({
      ...prev,
      [serverId]: [],
    }));
  };

  const handleCloseConsoleTab = (serverId: string) => {
    apiClient.unsubscribeLogs(parseInt(serverId));

    handleClearServerLogs(serverId);
    delete suppressReplayAfterClearRef.current[serverId];
    setActiveConsoleTab((prev) => (prev === serverId ? 'cli-console' : prev));
    setOpenConsoleTabs((prev) => prev.filter((id) => id !== serverId));
    setConsoleTerminalTarget((prev) => (prev?.serverId === Number(serverId) ? null : prev));
  };

  const handleClearCLI = () => {
    clearCliMessages();
  };

  const handleRenameServer = createRenameServerHandler({
    setGameServers,
    addCLIMessage,
    resolveServerName,
  });

  const handleRefreshServerSnapshot = createRefreshServerSnapshotHandler({
    addCLIMessage,
  });

  const handleStartAll = createStartAllHandler({
    gameServers,
    setGameServers,
    setCliMessages,
  });

  const handleStopAll = createStopAllHandler({
    gameServers,
    setGameServers,
    setCliMessages,
  });

  const usedInstallPorts = gameServers.reduce(
    (acc, server) => {
      (server.portMappings?.tcp || []).forEach((port) => acc.tcp.add(port));
      (server.portMappings?.udp || []).forEach((port) => acc.udp.add(port));
      return acc;
    },
    { tcp: new Set<number>(), udp: new Set<number>() }
  );
  const pageShellClassName = 'w-full px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6';

  return (
    <AppShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      mobileMenuOpen={mobileMenuOpen}
      setMobileMenuOpen={setMobileMenuOpen}
      handleRequestLogout={handleRequestLogout}
      handleOpenChangePassword={handleOpenChangePassword}
      canManageUsers={canManageUsers}
      currentUser={currentUser}
      pageShellClassName={pageShellClassName}
      gameServers={gameServers}
      serverMetricsHistoryById={serverMetricsHistoryById}
      serverHistoryById={serverHistoryById}
      gameNamesByKey={gameNamesByKey}
      consoleReadyByServer={consoleReadyByServer}
      serverPermissionsById={serverPermissionsById}
      handleDeleteServer={handleDeleteServer}
      handleServerAction={handleServerAction}
      openConsoleTerminal={openConsoleTerminal}
      handleRenameServer={handleRenameServer}
      handleRefreshServerSnapshot={handleRefreshServerSnapshot}
      handleStartAll={handleStartAll}
      handleStopAll={handleStopAll}
      canInstallServers={canInstallServers}
      installModalOpen={installModalOpen}
      setInstallModalOpen={setInstallModalOpen}
      handleInstallGame={handleInstallGame}
      installing={installing}
      installError={installError}
      installProgressPercent={installProgressPercent}
      installStatus={installStatus}
      installServerId={installServerId}
      installPermissionsSyncing={installPermissionsSyncing}
      usedInstallPorts={usedInstallPorts}
      handleClearInstallError={handleClearInstallError}
      openInstallLogs={openInstallLogs}
      serverLogs={serverLogs}
      cliMessages={cliMessages}
      handleClearServerLogs={handleClearServerLogs}
      handleClearCLI={handleClearCLI}
      activeConsoleTab={activeConsoleTab}
      setActiveConsoleTab={setActiveConsoleTab}
      handleCloseConsoleTab={handleCloseConsoleTab}
      openConsoleTabs={openConsoleTabs}
      consoleTerminalTarget={consoleTerminalTarget}
      setConsoleTerminalTarget={setConsoleTerminalTarget}
      activeLogPromptToasts={activeLogPromptToasts}
      removeLogPromptToast={removeLogPromptToast}
      logoutConfirmOpen={logoutConfirmOpen}
      setLogoutConfirmOpen={setLogoutConfirmOpen}
      handleLogout={handleLogout}
      changePasswordOpen={changePasswordOpen}
      setChangePasswordOpen={setChangePasswordOpen}
      currentUserId={currentUserId}
    />
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
