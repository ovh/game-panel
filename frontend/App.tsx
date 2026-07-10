import { useState, useEffect, useRef, useCallback } from 'react';
import { Login } from './components/Login';
import { ThemeProvider } from './contexts/ThemeContext';
import { type GameServer } from './types/gameServer';
import { apiClient } from './utils/api';
import { clearAppCache } from './utils/appStorage';
import { OVHCLOUD_IMAGES } from './utils/ovhcloudCatalog';
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
} from './components/app/appRuntime';
import {
  type LogEntry,
  type ServerHistoryById,
  type ServerHistoryEntry,
  type ServerLogs,
  type ServerMetricHistoryPoint,
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
  const suppressReplayAfterClearRef = useRef<Record<string, boolean>>({});
  const lastInstallProgressLogRef = useRef<Record<number, number>>({});
  const handleWebSocketMessageRef = useRef<(message: any) => void>(() => {});
  const handleLogoutRef = useRef<() => void>(() => {});
  const subscribedMetricsServerIdsRef = useRef<Set<number>>(new Set());
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
  const [installInteraction, setInstallInteraction] = useState<import('./types/gameServer').InstallInteraction | null>(null);
  const [installPlan, setInstallPlan] = useState<import('./types/gameServer').InstallStep[]>([]);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const metricsServerIdsKey = gameServers
    .map((server) => server.id)
    .sort()
    .join(',');

  // Tracks which LinuxGSM game keys have already had their metadata fetched this session.
  const loadedLgsmGameKeysRef = useRef<Set<string>>(new Set());

  const loadCatalogMetadata = useCallback(() => {
    const mapping: Record<string, string> = {};
    OVHCLOUD_IMAGES.forEach((image) => {
      mapping[image.imageId] = image.name;
    });
    setGameNamesByKey(mapping);
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

    return () => {
      cancelled = true;
    };
  }, [loadCatalogMetadata]);

  // Lazily load log prompt rules per installed LinuxGSM game type — only present games, once per key per session.
  const lgsmGameTypesKey = gameServers
    .filter((s) => s.provider === 'linuxgsm')
    .map((s) => s.game)
    .filter(Boolean)
    .sort()
    .join(',');

  useEffect(() => {
    if (!lgsmGameTypesKey) return;
    const keys = lgsmGameTypesKey.split(',');
    const newKeys = keys.filter((key) => !loadedLgsmGameKeysRef.current.has(key));
    if (newKeys.length === 0) return;

    newKeys.forEach((key) => loadedLgsmGameKeysRef.current.add(key));

    void Promise.all(newKeys.map((key) => apiClient.getCatalogGame(key))).then((results) => {
      const newRules: LogPromptRule[] = [];
      results.forEach((game, i) => {
        if (!game || !Array.isArray(game.logPrompts)) return;
        const gameKey = newKeys[i];
        game.logPrompts.forEach((prompt: any) => {
          if (prompt.match && prompt.action) {
            newRules.push({
              gameKeys: [gameKey],
              gameName: game.gamename || gameKey,
              title: prompt.title || 'Action required',
              match: prompt.match,
              action: prompt.action,
            });
          }
        });
      });
      if (newRules.length > 0) {
        setLogPromptRules((prev) => [...prev, ...newRules]);
      }
    });
  }, [lgsmGameTypesKey]);

  useEffect(() => {
    // Per-server metrics only render on the game-servers view; subscribe only while active to avoid a fleet-wide stream.
    if (!authReady || !isAuthenticated || activeTab !== 'game-servers') {
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
  }, [authReady, isAuthenticated, activeTab, metricsServerIdsKey]);

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
      if (!canAccessServer(serverId, 'container.logs.read')) {
        addCLIMessage(
          'error',
          "You don't have permission to view this server's logs",
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
    if (!canAccessServer(serverId, 'server.command.send')) {
      addCLIMessage(
        'error',
        "You don't have permission to send commands to this server",
        resolveServerName(serverId, serverName),
        'console-terminal'
      );
      return;
    }
    const name = resolveServerName(serverId, serverName);
    const provider = gameServers.find((s) => Number(s.id) === serverId)?.provider ?? '';
    setConsoleTerminalTarget({ serverId, serverName: name, provider });
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
        subscribedMetricsServerIdsRef.current.delete(numericServerId);
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
    let portsData: {
      tcp: Array<{ host: number; container: number; label: string }>;
      udp: Array<{ host: number; container: number; label: string }>;
    } | null = null;
    try {
      const raw = server?.ports;
      portsData = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? null);
    } catch {}

    let primary: number | null = null;
    let portMappings: { tcp: number[]; udp: number[] } = existing?.portMappings ?? { tcp: [], udp: [] };
    let portLabels: { tcp: Record<string, string>; udp: Record<string, string> } =
      existing?.portLabels ?? { tcp: {}, udp: {} };

    if (portsData) {
      const tcpEntries = Array.isArray(portsData.tcp) ? portsData.tcp : [];
      const udpEntries = Array.isArray(portsData.udp) ? portsData.udp : [];
      portMappings = {
        tcp: tcpEntries.map((e) => e.host).filter((h) => Number.isFinite(h) && h > 0),
        udp: udpEntries.map((e) => e.host).filter((h) => Number.isFinite(h) && h > 0),
      };
      portLabels = {
        tcp: Object.fromEntries(
          tcpEntries.filter((e) => e.host && e.label).map((e) => [String(e.host), e.label])
        ),
        udp: Object.fromEntries(
          udpEntries.filter((e) => e.host && e.label).map((e) => [String(e.host), e.label])
        ),
      };
      const isGame = (label: string) => label.toLowerCase().includes('game');
      primary =
        portMappings.tcp.find((p) => isGame(portLabels.tcp[String(p)] ?? '')) ??
        portMappings.udp.find((p) => isGame(portLabels.udp[String(p)] ?? '')) ??
        portMappings.tcp[0] ??
        portMappings.udp[0] ??
        null;
    } else {
      primary = existing?.port ?? null;
    }

    return {
      id: String(server.id),
      name: server.name,
      game: server.catalogId ?? (server.provider === 'external' ? server.dockerImage : null) ?? server.provider ?? '',
      provider: server.provider,
      catalogId: server.catalogId,
      port: primary ?? undefined,
      portMappings,
      portLabels,
      status: mapBackendStatusToUi(server.status),
      dockerContainerId: server.dockerContainerId ?? null,
      installStatus: server.installProgress?.status ?? null,
      installProgress: server.installProgress?.progress ?? null,
      desiredState: server.desiredState,
      containerStatus: server.containerStatus,
      healthStatus: server.healthStatus,
      lastError: server.lastError ?? null,
      providerMetadataJson: server.providerMetadata ? JSON.stringify(server.providerMetadata) : null,
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
    clearAppCache();
    resetSession();
    setMobileMenuOpen(false);
    setGameServers([]);
    setServerLogs({});
    setServerHistoryById({});
    setServerMetricsHistoryById({});
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
    setInstallPlan([]);
    subscribedMetricsServerIdsRef.current.clear();
  };

  // Stable ref so the 401 handler can call the latest logout without re-registering each render.
  handleLogoutRef.current = handleLogout;

  // On 401 the API client clears the token; reset to the login screen in place rather than a full reload.
  useEffect(() => {
    apiClient.setUnauthorizedHandler(() => {
      handleLogoutRef.current();
    });
    return () => apiClient.setUnauthorizedHandler(null);
  }, []);

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
    setInstallPlan,
    refreshInstallPermissions,
  });

  const handleInstallGame = async (payload: InstallGameHandlerPayload) => {
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
      installInteraction={installInteraction}
      setInstallInteraction={setInstallInteraction}
      installPlan={installPlan}
      installPermissionsSyncing={installPermissionsSyncing}
      usedInstallPorts={usedInstallPorts}
      handleClearInstallError={handleClearInstallError}
      openInstallLogs={openInstallLogs}
      serverLogs={serverLogs}
      onAppendServerLog={handleAddLog}
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
