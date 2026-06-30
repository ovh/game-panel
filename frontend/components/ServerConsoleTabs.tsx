import { Terminal, Trash2, X, Copy, ArrowDown, CornerDownLeft } from 'lucide-react';
import { memo, useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { AppButton, AppToggle } from '../src/ui/components';
import { ansiToHtml, stripAnsi } from '../utils/ansi';
import type { GameServer } from '../types/gameServer';
import type { CLIMessage } from '../types/cli';

interface LogEntry {
  id: number;
  timestamp: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'command' | 'action';
  message: string;
}

interface ServerLogs {
  [serverId: string]: LogEntry[];
}

// Renders one ANSI log/console line. Memoized so ansiToHtml runs once per
// (message, className) instead of on every parent re-render — the console re-renders
// on every new log line, and without this each render re-converted every visible line.
// Safe: ansiToHtml uses escapeXML:true to sanitize HTML entities before injection.
const AnsiLine = memo(function AnsiLine({
  className,
  message,
}: {
  className: string;
  message: string;
}) {
  const __html = useMemo(() => ansiToHtml(message), [message]);
  return <pre className={className} dangerouslySetInnerHTML={{ __html }} />;
});

interface ServerConsoleTabsProps {
  servers: GameServer[];
  logs: ServerLogs;
  cliMessages: CLIMessage[];
  onClearLogs: (serverId: string) => void;
  onClearCLI: () => void;
  activeTab: string | null;
  onSetActiveTab: (serverId: string) => void;
  onCloseTab: (serverId: string) => void;
  openTabs: string[];
  canSendCommandByServer?: Record<string, boolean>;
  onSendCommand?: (serverId: string, command: string) => Promise<void>;
}

export function ServerConsoleTabs({
  servers,
  logs,
  cliMessages,
  onClearLogs,
  onClearCLI,
  activeTab,
  onSetActiveTab,
  onCloseTab,
  openTabs,
  canSendCommandByServer,
  onSendCommand,
}: ServerConsoleTabsProps) {
  const [isMinimized] = useState(false);
  const [commandValue, setCommandValue] = useState('');
  const [commandSending, setCommandSending] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);
  const [autoScrollCli, setAutoScrollCli] = useState(true);
  const [autoScrollServer, setAutoScrollServer] = useState(true);
  const [pendingCliLogs, setPendingCliLogs] = useState(0);
  const [pendingServerLogs, setPendingServerLogs] = useState(0);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const cliContainerRef = useRef<HTMLDivElement>(null);
  const serverContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticCliScrollRef = useRef(false);
  const isProgrammaticServerScrollRef = useRef(false);
  const previousCliLengthRef = useRef(0);
  const previousActiveServerLogLengthRef = useRef(0);
  const scrollPositionsByTabRef = useRef<Record<string, number>>({});
  const isCLIConsoleActive = activeTab === 'cli-console';
  const activeServer = servers.find((s) => s.id === activeTab);
  const activeLogs = activeTab && activeTab !== 'cli-console' ? logs[activeTab] || [] : [];
  const openTabServers = servers.filter((server) => openTabs.includes(server.id));

  const isNearBottom = (element: HTMLDivElement | null, threshold = 36) => {
    if (!element) return true;
    return element.scrollHeight - (element.scrollTop + element.clientHeight) <= threshold;
  };

  const scrollContainerToBottom = (
    element: HTMLDivElement | null,
    behavior: ScrollBehavior = 'auto'
  ) => {
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
  };

  const saveScrollPosition = (tabId: string | null, element: HTMLDivElement | null) => {
    if (!tabId || !element) return;
    scrollPositionsByTabRef.current[tabId] = element.scrollTop;
  };

  const syncAutoScrollState = (tabId: string, element: HTMLDivElement) => {
    const atBottom = isNearBottom(element);

    if (tabId === 'cli-console') {
      setAutoScrollCli(atBottom);
      if (atBottom) setPendingCliLogs(0);
      return;
    }

    setAutoScrollServer(atBottom);
    if (atBottom) setPendingServerLogs(0);
  };

  const scrollContainerToBottomProgrammatic = (
    element: HTMLDivElement | null,
    scrollFlagRef: React.MutableRefObject<boolean>,
    behavior: ScrollBehavior = 'auto',
    tabId: string | null = null
  ) => {
    if (!element) return;
    scrollFlagRef.current = true;
    requestAnimationFrame(() => {
      scrollContainerToBottom(element, behavior);
      saveScrollPosition(tabId, element);
      requestAnimationFrame(() => {
        scrollContainerToBottom(element, behavior);
        saveScrollPosition(tabId, element);
        scrollFlagRef.current = false;
      });
    });
  };

  useLayoutEffect(() => {
    if (!activeTab || isMinimized) return;

    const tabId = isCLIConsoleActive ? 'cli-console' : activeTab;
    const element = isCLIConsoleActive ? cliContainerRef.current : serverContainerRef.current;
    const scrollFlagRef = isCLIConsoleActive
      ? isProgrammaticCliScrollRef
      : isProgrammaticServerScrollRef;

    if (!element) return;

    const nextScrollTop = scrollPositionsByTabRef.current[tabId] ?? Infinity;
    scrollFlagRef.current = true;

    let restoreFrameId = 0;
    let finalizeFrameId = 0;

    restoreFrameId = requestAnimationFrame(() => {
      element.scrollTop = nextScrollTop;
      saveScrollPosition(tabId, element);

      finalizeFrameId = requestAnimationFrame(() => {
        scrollFlagRef.current = false;
        syncAutoScrollState(tabId, element);
      });
    });

    return () => {
      cancelAnimationFrame(restoreFrameId);
      cancelAnimationFrame(finalizeFrameId);
      scrollFlagRef.current = false;
    };
  }, [activeTab, isCLIConsoleActive, isMinimized]);

  useEffect(() => {
    const validTabs = new Set(['cli-console', ...openTabs]);

    Object.keys(scrollPositionsByTabRef.current).forEach((tabId) => {
      if (!validTabs.has(tabId)) {
        delete scrollPositionsByTabRef.current[tabId];
      }
    });
  }, [openTabs]);

  useEffect(() => {
    if (isCLIConsoleActive) {
      previousCliLengthRef.current = cliMessages.length;
      setPendingCliLogs(0);
      return;
    }

    if (activeTab && activeTab !== 'cli-console') {
      previousActiveServerLogLengthRef.current = activeLogs.length;
      setPendingServerLogs(0);
    }
  }, [activeTab]);

  useEffect(() => {
    const diff = cliMessages.length - previousCliLengthRef.current;
    previousCliLengthRef.current = cliMessages.length;

    if (diff <= 0) {
      if (cliMessages.length === 0) setPendingCliLogs(0);
      return;
    }
    if (!isCLIConsoleActive || isMinimized) return;

    if (autoScrollCli) {
      scrollContainerToBottomProgrammatic(
        cliContainerRef.current,
        isProgrammaticCliScrollRef,
        'auto',
        'cli-console'
      );
      setPendingCliLogs(0);
      return;
    }

    setPendingCliLogs((prev) => prev + diff);
  }, [cliMessages.length, isCLIConsoleActive, isMinimized, autoScrollCli]);

  useEffect(() => {
    if (!activeTab || isCLIConsoleActive) return;

    const diff = activeLogs.length - previousActiveServerLogLengthRef.current;
    previousActiveServerLogLengthRef.current = activeLogs.length;

    if (diff <= 0) {
      if (activeLogs.length === 0) setPendingServerLogs(0);
      return;
    }
    if (isMinimized) return;

    if (autoScrollServer) {
      scrollContainerToBottomProgrammatic(
        serverContainerRef.current,
        isProgrammaticServerScrollRef,
        'auto',
        activeTab
      );
      setPendingServerLogs(0);
      return;
    }

    setPendingServerLogs((prev) => prev + diff);
  }, [activeLogs.length, activeTab, isCLIConsoleActive, isMinimized, autoScrollServer]);

  const handleCliScroll = () => {
    const el = cliContainerRef.current;
    if (!el) return;
    if (isProgrammaticCliScrollRef.current) {
      if (isNearBottom(el)) {
        setAutoScrollCli(true);
        setPendingCliLogs(0);
      }
      return;
    }
    const atBottom = isNearBottom(el);
    setAutoScrollCli(atBottom);
    if (atBottom) setPendingCliLogs(0);
    saveScrollPosition('cli-console', el);
  };

  const handleServerScroll = () => {
    const el = serverContainerRef.current;
    if (!el) return;
    if (isProgrammaticServerScrollRef.current) {
      if (isNearBottom(el)) {
        setAutoScrollServer(true);
        setPendingServerLogs(0);
      }
      return;
    }
    const atBottom = isNearBottom(el);
    setAutoScrollServer(atBottom);
    if (atBottom) setPendingServerLogs(0);
    saveScrollPosition(activeTab, el);
  };

  const scrollCliToBottom = () => {
    setAutoScrollCli(true);
    setPendingCliLogs(0);
    scrollContainerToBottomProgrammatic(
      cliContainerRef.current,
      isProgrammaticCliScrollRef,
      'auto',
      'cli-console'
    );
  };

  const scrollServerToBottom = () => {
    setAutoScrollServer(true);
    setPendingServerLogs(0);
    scrollContainerToBottomProgrammatic(
      serverContainerRef.current,
      isProgrammaticServerScrollRef,
      'auto',
      activeTab
    );
  };

  const getLogColor = (type: LogEntry['type']) => {
    const isDark = true;
    switch (type) {
      case 'error':
        return isDark ? 'text-red-400' : 'text-red-200';
      case 'warning':
        return isDark ? 'text-yellow-400' : 'text-yellow-200';
      case 'success':
        return isDark ? 'text-green-400' : 'text-green-200';
      case 'command':
        return isDark ? 'text-[var(--color-cyan-400)]' : 'text-white';
      case 'action':
        return isDark ? 'text-purple-400' : 'text-purple-200';
      default:
        return isDark ? 'text-gray-300' : 'text-white';
    }
  };

  const formatLogDateTime = (value: string) => {
    const parsed = new Date(value);
    const date = !Number.isNaN(parsed.getTime()) ? parsed : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  const cardBg = 'bg-gp-surface-card shadow-[0_4px_24px_rgba(2,6,23,0.55),0_1px_4px_rgba(2,6,23,0.3)]';
  const borderColor = 'border-gray-700';
  const textSecondary = 'text-gray-400';

  const ACTION_LABELS: Record<string, string> = {
    console: 'Logs',
    'console-terminal': 'Terminal',
    install: 'Install',
    delete: 'Delete',
    rename: 'Rename',
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
    'start-all': 'Start all',
    'stop-all': 'Stop all',
  };
  const tabBg = 'bg-gp-surface-elevated';
  const tabActiveBg = 'border-[var(--gp-primary-300)] bg-[var(--gp-primary-300)]';
  const tabActiveText = 'text-[#031126]';
  const tabHoverBg = 'hover:bg-gray-700';
  const terminalBg = 'bg-black';

  const handleCopyCliLogs = async () => {
    const lines = (cliMessages || []).map((msg) => {
      const server = msg.server ? ` ${msg.server}` : '';
      const action = msg.action ? ` -> ${msg.action}` : '';
      const timestamp = showTimestamps ? `[${formatLogDateTime(msg.timestamp)}]` : '';
      return `${timestamp}${server}${action}\n${stripAnsi(msg.message)}`.trim();
    });

    try {
      await navigator.clipboard.writeText(lines.join('\n\n'));
    } catch {}
  };

  const handleCopyServerLogs = async () => {
    const lines = (activeLogs || []).map((log) => {
      const timestamp = showTimestamps ? `[${formatLogDateTime(log.timestamp)}] ` : '';
      const message = log.message;
      return `${timestamp}${stripAnsi(message)}`.trim();
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {}
  };

  const handleCopyActiveLogs = () => {
    if (isCLIConsoleActive) {
      void handleCopyCliLogs();
      return;
    }
    void handleCopyServerLogs();
  };

  const handleSendCommand = async () => {
    if (!activeTab || !commandValue.trim() || commandSending) return;
    const cmd = commandValue.trim();
    setCommandHistory((prev) => [cmd, ...prev].slice(0, 100));
    setHistoryIndex(-1);
    setHistoryDraft('');
    setCommandValue('');
    setCommandSending(true);
    try {
      await onSendCommand?.(activeTab, cmd);
    } finally {
      setCommandSending(false);
    }
  };

  useEffect(() => {
    if (!commandSending) {
      commandInputRef.current?.focus();
    }
  }, [commandSending]);

  const handleCommandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !commandSending) {
      void handleSendCommand();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= commandHistory.length) return;
      if (historyIndex === -1) setHistoryDraft(commandValue);
      setHistoryIndex(nextIndex);
      setCommandValue(commandHistory[nextIndex]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setCommandValue(historyDraft);
        return;
      }
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      setCommandValue(commandHistory[nextIndex]);
    }
  };

  const handleClearActiveLogs = () => {
    if (isCLIConsoleActive) {
      onClearCLI();
      return;
    }
    if (activeTab) {
      onClearLogs(activeTab);
    }
  };

  return (
    <div className={`gp-console-panel ${cardBg} rounded-lg border ${borderColor} shadow-lg overflow-hidden`}>
      <div
        className={`flex min-h-[44px] items-stretch justify-between border-b ${borderColor} rounded-t-lg overflow-hidden bg-gp-surface-input`}
      >
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto hide-scrollbar">
          <div
            className={`flex h-full shrink-0 items-center gap-2 border-l px-4 transition-colors cursor-pointer select-none ${
              activeTab === 'cli-console'
                ? `${tabActiveBg} ${tabActiveText}`
                : `${borderColor} ${tabBg} ${textSecondary} ${tabHoverBg}`
            } ${openTabServers.length > 0 ? 'border-r' : ''}`}
            onClick={() => onSetActiveTab('cli-console')}
          >
            <Terminal className="w-4 h-4" />
            <span
              className={`text-sm font-bold whitespace-nowrap ${
                activeTab === 'cli-console' ? tabActiveText : 'text-[var(--gp-primary-300)]'
              }`}
            >
              Activity
            </span>
            {cliMessages && cliMessages.length > 0 && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                  activeTab === 'cli-console'
                    ? 'bg-[#031126]/15 text-[#031126]'
                    : 'bg-[var(--gp-ods-accent-secondary)] text-white'
                }`}
              >
                {cliMessages.length}
              </span>
            )}
          </div>

          {openTabServers.map((server, index) => {
              const isLastOpenTab = index === openTabServers.length - 1;
              const isActiveServerTab = activeTab === server.id;
              return (
                <div
                  key={server.id}
                  onClick={() => onSetActiveTab(server.id)}
                  className={`relative flex h-full shrink-0 items-center gap-2 px-4 transition-colors group cursor-pointer select-none ${
                    isActiveServerTab
                      ? `${tabActiveBg} ${tabActiveText}`
                      : `${borderColor} ${tabBg} ${textSecondary} ${tabHoverBg}`
                  } ${isLastOpenTab ? '' : 'border-r'}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    <span className="text-sm font-medium whitespace-nowrap">{server.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(server.id);
                    }}
                    aria-label={`Close ${server.name} tab`}
                    className={`ml-2 inline-flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                      isActiveServerTab
                        ? 'bg-transparent text-[#031126] opacity-60 hover:opacity-100 hover:bg-[#031126]/10'
                        : 'bg-transparent opacity-0 text-slate-400 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400'
                    }`}
                  >
                    <X className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
        </div>
        <div className="flex min-h-full self-stretch flex-shrink-0 items-center gap-1 sm:gap-2 bg-gp-surface-input px-2 sm:px-4 py-0">
          <div className="flex h-full items-center justify-center gap-2">
            <span className={`hidden sm:inline text-xs ${textSecondary}`}>Date/Time</span>
            <AppToggle
              checked={showTimestamps}
              onChange={setShowTimestamps}
              ariaLabel="Toggle timestamps"
              size="compact"
            />
          </div>
          <AppButton
            tone="ghost"
            onClick={handleCopyActiveLogs}
            className={`inline-flex h-8 items-center gap-2 px-2 sm:px-3 rounded ${tabHoverBg} transition-colors ${textSecondary} hover:text-[var(--color-cyan-400)] text-sm`}
          >
            <Copy className="w-3 h-3" />
            <span className="hidden sm:inline">Copy</span>
          </AppButton>
          <AppButton
            tone="ghost"
            onClick={handleClearActiveLogs}
            className={`inline-flex h-8 items-center gap-2 px-2 sm:px-3 rounded ${tabHoverBg} transition-colors ${textSecondary} hover:text-orange-400 text-sm`}
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden sm:inline">Clear</span>
          </AppButton>
        </div>
      </div>

      {!isMinimized && activeTab && (
        <div className="flex flex-col h-[400px] min-h-0">
          {isCLIConsoleActive && (
            <>
              <div className="gp-console-terminal-wrapper relative flex-1 min-h-0">
                <div
                  ref={cliContainerRef}
                  onScroll={handleCliScroll}
                  className={`gp-console-terminal h-full ${terminalBg} p-2 overflow-y-auto hide-scrollbar`}
                >
                  {!cliMessages || cliMessages.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                      <Terminal className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No messages yet. Execute an action to see logs.</p>
                    </div>
                  ) : (
                    cliMessages.map((msg) => (
                      <div key={msg.id} className="mb-2 border-b border-gray-800/70 pb-2 last:mb-0">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            {(showTimestamps || msg.server || msg.action) && (
                              <div className="mb-1 flex items-center gap-2 text-xs">
                                {showTimestamps && (
                                  <span className="font-mono text-gray-500">
                                    {formatLogDateTime(msg.timestamp)}
                                  </span>
                                )}
                                {msg.server && (
                                  <span className="text-sm font-medium text-[var(--color-cyan-400)]">
                                    {msg.server}
                                  </span>
                                )}
                                {msg.action && ACTION_LABELS[msg.action] && (
                                  <>
                                    {msg.server && <span className="text-gray-600">-&gt;</span>}
                                    <span className="tracking-wide text-gray-400">
                                      {ACTION_LABELS[msg.action]}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                            <AnsiLine
                              className={`font-mono text-sm leading-5 whitespace-pre-wrap ${
                                msg.type === 'error'
                                  ? 'text-red-400'
                                  : msg.type === 'warning'
                                    ? 'text-yellow-400'
                                    : msg.type === 'success'
                                      ? 'text-green-400'
                                      : 'text-gray-300'
                              }`}
                              message={msg.message}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {!autoScrollCli && pendingCliLogs > 0 && (
                  <AppButton
                    tone="ghost"
                    onClick={scrollCliToBottom}
                    className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-cyan-400)]/60 bg-[var(--gp-console-scroll-bg,#0b2f35)]/95 px-3 py-2 text-sm font-semibold text-[var(--color-cyan-400)] shadow-lg transition-colors hover:bg-[var(--gp-console-scroll-hover,#104049)]"
                  >
                    <ArrowDown className="h-4 w-4" />
                    {pendingCliLogs} new log{pendingCliLogs > 1 ? 's' : ''}
                  </AppButton>
                )}
              </div>
            </>
          )}

          {!isCLIConsoleActive && activeServer && (
            <>
              <div className="gp-console-terminal-wrapper relative flex-1 min-h-0">
                <div
                  ref={serverContainerRef}
                  onScroll={handleServerScroll}
                  className={`gp-console-terminal h-full ${terminalBg} p-2 overflow-y-auto overflow-x-auto hide-scrollbar font-mono text-sm`}
                >
                  {activeLogs.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Terminal className="mx-auto mb-2 h-12 w-12 opacity-50" />
                      <p>No logs yet. Execute an action to see logs.</p>
                    </div>
                  ) : (
                    activeLogs.map((log) => (
                      <div
                        key={log.id}
                        className="mb-1 flex items-start gap-2 rounded px-1 leading-5 hover:bg-white/5"
                      >
                        {showTimestamps && (
                          <span className="shrink-0 text-gray-500">
                            [{formatLogDateTime(log.timestamp)}]
                          </span>
                        )}
                        <AnsiLine
                          className={`m-0 inline-block min-w-max flex-none whitespace-pre font-mono text-sm ${getLogColor(log.type)}`}
                          message={log.message}
                        />
                      </div>
                    ))
                  )}
                </div>

                {!autoScrollServer && pendingServerLogs > 0 && (
                  <AppButton
                    tone="ghost"
                    onClick={scrollServerToBottom}
                    className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-cyan-400)]/60 bg-[var(--gp-console-scroll-bg,#0b2f35)]/95 px-3 py-2 text-sm font-semibold text-[var(--color-cyan-400)] shadow-lg transition-colors hover:bg-[var(--gp-console-scroll-hover,#104049)]"
                  >
                    <ArrowDown className="h-4 w-4" />
                    {pendingServerLogs} new log{pendingServerLogs > 1 ? 's' : ''}
                  </AppButton>
                )}
              </div>
              {(() => {
                const canSend = canSendCommandByServer?.[activeServer.id] ?? false;
                const isStopped = activeServer.status === 'stopped';
                const isInputDisabled = commandSending || !canSend || isStopped;
                const inputPlaceholder = isStopped
                  ? 'The server is stopped. Start it to send commands.'
                  : canSend
                    ? 'Type a command and press Enter…'
                    : 'No permission to send commands';
                return (
                  <div className={`shrink-0 flex items-center gap-2 border-t ${borderColor} bg-[#0d1117] px-4 py-2.5`}>
                    <span className="shrink-0 select-none font-mono text-sm font-bold text-[var(--color-cyan-400)]">
                      {commandSending ? '…' : '>'}
                    </span>
                    <input
                      ref={commandInputRef}
                      type="text"
                      value={commandValue}
                      onChange={(e) => {
                        setCommandValue(e.target.value);
                        if (historyIndex !== -1) setHistoryIndex(-1);
                      }}
                      onKeyDown={handleCommandKeyDown}
                      disabled={isInputDisabled}
                      placeholder={inputPlaceholder}
                      style={{ color: isInputDisabled ? '#4b5563' : '#e2e8f0' }}
                      className="flex-1 bg-transparent font-mono text-sm caret-[var(--color-cyan-400)] placeholder-gray-600 focus:outline-none disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={() => void handleSendCommand()}
                      disabled={commandSending || !commandValue.trim() || !canSend}
                      title="Send command (Enter)"
                      className="shrink-0 rounded p-1.5 text-gray-600 transition-colors hover:bg-[var(--color-cyan-400)]/10 hover:text-[var(--color-cyan-400)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <CornerDownLeft className="h-4 w-4" />
                    </button>
                  </div>
                );
              })()}
            </>
          )}

        </div>
      )}
    </div>
  );
}

