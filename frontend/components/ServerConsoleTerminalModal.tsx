import { Terminal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { apiClient } from '../utils/api';

type TerminalStatus = 'idle' | 'creating' | 'connecting' | 'connected' | 'closed' | 'error';
type AttachResult = 'attached' | 'unknown-session' | 'error';

const CONSOLE_SESSION_STORAGE_KEY = 'gp_console_terminal_sessions';

const loadConsoleSessionCache = (): Map<number, string> => {
  if (typeof window === 'undefined') return new Map<number, string>();

  try {
    const raw = window.localStorage.getItem(CONSOLE_SESSION_STORAGE_KEY);
    if (!raw) return new Map<number, string>();

    const parsed = JSON.parse(raw) as Record<string, string>;
    const cache = new Map<number, string>();

    Object.entries(parsed).forEach(([serverIdRaw, sessionId]) => {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return;

      const parsedServerId = Number(serverIdRaw);
      if (!Number.isFinite(parsedServerId) || parsedServerId <= 0) return;

      cache.set(parsedServerId, sessionId);
    });

    return cache;
  } catch {
    return new Map<number, string>();
  }
};

const CONSOLE_SESSION_CACHE = loadConsoleSessionCache();

const persistConsoleSessionCache = () => {
  if (typeof window === 'undefined') return;

  const serializable: Record<string, string> = {};
  CONSOLE_SESSION_CACHE.forEach((sessionId, serverId) => {
    serializable[String(serverId)] = sessionId;
  });

  try {
    window.localStorage.setItem(CONSOLE_SESSION_STORAGE_KEY, JSON.stringify(serializable));
  } catch {}
};

interface ConsoleTerminalTarget {
  serverId: number | null;
  serverName: string;
}

interface ServerConsoleTerminalModalProps extends ConsoleTerminalTarget {
  isOpen: boolean;
  onClose: () => void;
}

export function ServerConsoleTerminalModal({
  isOpen,
  serverId,
  serverName,
  onClose,
}: ServerConsoleTerminalModalProps) {
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const safetyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encoderRef = useRef<TextEncoder>(new TextEncoder());

  const showSafetyNotice = (message: string) => {
    setSafetyNotice(message);
    if (safetyNoticeTimerRef.current) {
      clearTimeout(safetyNoticeTimerRef.current);
    }
    safetyNoticeTimerRef.current = setTimeout(() => {
      setSafetyNotice(null);
      safetyNoticeTimerRef.current = null;
    }, 2600);
  };

  const encodeBase64 = (data: string) => {
    const encoded = encoderRef.current.encode(data);
    let binary = '';
    for (let i = 0; i < encoded.length; i += 1) {
      binary += String.fromCharCode(encoded[i]);
    }
    return btoa(binary);
  };

  const decodeBase64 = (dataB64: string) => {
    const binary = atob(dataB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const sendResize = (cols?: number, rows?: number) => {
    const ws = wsRef.current;
    const sessionId = sessionIdRef.current;
    const term = termRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !sessionId || !term) return;

    ws.send(
      JSON.stringify({
        type: 'terminal:resize',
        sessionId,
        cols: cols ?? term.cols,
        rows: rows ?? term.rows,
      })
    );
  };

  const sendInput = (data: string) => {
    const ws = wsRef.current;
    const sessionId = sessionIdRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !sessionId) return;

    ws.send(
      JSON.stringify({
        type: 'terminal:input',
        sessionId,
        dataB64: encodeBase64(data),
      })
    );
  };

  const teardownTerminal = () => {
    resizeDisposableRef.current?.dispose();
    resizeDisposableRef.current = null;
    dataDisposableRef.current?.dispose();
    dataDisposableRef.current = null;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitAddonRef.current = null;
    if (safetyNoticeTimerRef.current) {
      clearTimeout(safetyNoticeTimerRef.current);
      safetyNoticeTimerRef.current = null;
    }
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    sessionIdRef.current = null;
    setStatus((prev) => (prev === 'idle' ? prev : 'closed'));
  };

  const ensureTerminal = () => {
    if (!containerRef.current || termRef.current) return;

    const term = new XTerm({
      fontSize: 12,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      scrollback: 3000,
      fontWeight: 500,
      fontWeightBold: 600,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: {
        background: '#020617',
        foreground: '#e5e7eb',
        cursor: '#34d399',
        selectionBackground: '#1f2937',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    requestAnimationFrame(() => {
      fitAddon.fit();
      sendResize();
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    resizeDisposableRef.current = term.onResize(
      ({ cols, rows }: { cols: number; rows: number }) => {
        sendResize(cols, rows);
      }
    );

    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isCtrlOrMeta = event.ctrlKey || event.metaKey;
      const isCtrlC = isCtrlOrMeta && !event.altKey && key === 'c';
      if (!isCtrlC) return true;

      const selection = term.getSelection();
      if (selection && selection.length > 0) {
        return true;
      }

      showSafetyNotice('Ctrl+C blocked to avoid stopping the game server.');
      return false;
    });

    dataDisposableRef.current = term.onData((data: string) => {
      if (!data) return;

      if (data.includes('\u0003')) {
        const sanitized = data.split('\u0003').join('');
        showSafetyNotice('Signal ^C blocked to avoid stopping the game server.');
        if (sanitized.length > 0) {
          sendInput(sanitized);
        }
        return;
      }

      sendInput(data);
    });

    resizeObserverRef.current = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize();
    });
    resizeObserverRef.current.observe(containerRef.current);
  };

  const startSession = async () => {
    if (!serverId) {
      setError('Missing server id for console terminal.');
      setStatus('error');
      return;
    }

    if (status === 'creating' || status === 'connecting' || status === 'connected') return;

    setError(null);
    setStatus('creating');
    ensureTerminal();

    const createSession = async (): Promise<string> => {
      const { sessionId } = await apiClient.createConsoleTerminalSession(serverId);
      sessionIdRef.current = sessionId;
      CONSOLE_SESSION_CACHE.set(serverId, sessionId);
      persistConsoleSessionCache();
      return sessionId;
    };

    const attachToSession = (attachSessionId: string): Promise<AttachResult> =>
      new Promise((resolve) => {
        let settled = false;
        let attached = false;

        const settle = (value: AttachResult) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        const closeAndResetSocket = () => {
          const ws = wsRef.current;
          if (!ws) return;
          try {
            ws.close();
          } catch {}
          wsRef.current = null;
        };

        void apiClient
          .createAuthenticatedWebSocket()
          .then((ws) => {
            wsRef.current = ws;
            sessionIdRef.current = attachSessionId;
            setStatus('connecting');

            ws.onmessage = (event) => {
              try {
                const message = JSON.parse(event.data);

                if (message.type === 'terminal:attached') {
                  attached = true;
                  setStatus('connected');
                  sendResize();
                  termRef.current?.focus();
                  settle('attached');
                  return;
                }

                if (message.type === 'terminal:output') {
                  const data = decodeBase64(message.dataB64 || '');
                  if (data.length) termRef.current?.write(data);
                  return;
                }

                if (message.type === 'terminal:error') {
                  const errorText = String(message.error || 'Terminal error');
                  const normalized = errorText.toLowerCase();

                  if (!attached && normalized.includes('unknown session')) {
                    sessionIdRef.current = null;
                    closeAndResetSocket();
                    settle('unknown-session');
                    return;
                  }

                  setError(errorText);
                  setStatus('error');
                  if (!attached) {
                    closeAndResetSocket();
                    settle('error');
                  }
                  return;
                }

                if (message.type === 'terminal:closed') {
                  setStatus('closed');
                  if (!attached) {
                    closeAndResetSocket();
                    settle('error');
                  }
                }
              } catch {
                // ignore malformed payloads from the terminal stream
              }
            };

            ws.onerror = () => {
              setError('WebSocket error while connecting console terminal.');
              setStatus('error');
              if (!attached) {
                closeAndResetSocket();
                settle('error');
              }
            };

            ws.onclose = () => {
              setStatus((prev) => (prev === 'idle' ? prev : 'closed'));
              if (!attached) {
                settle('error');
              }
            };

            ws.send(JSON.stringify({ type: 'terminal:attach', sessionId: attachSessionId }));
          })
          .catch(() => {
            setError('WebSocket authentication failed for console terminal.');
            setStatus('error');
            settle('error');
          });
      });

    try {
      const cachedSessionId = sessionIdRef.current || CONSOLE_SESSION_CACHE.get(serverId) || null;

      if (cachedSessionId) {
        const attachResult = await attachToSession(cachedSessionId);
        if (attachResult === 'attached') return;

        CONSOLE_SESSION_CACHE.delete(serverId);
        persistConsoleSessionCache();
        sessionIdRef.current = null;
      }

      const newSessionId = await createSession();
      const attachResult = await attachToSession(newSessionId);

      if (attachResult === 'unknown-session') {
        CONSOLE_SESSION_CACHE.delete(serverId);
        persistConsoleSessionCache();
        setError('Console session expired. Reopen the terminal and try again.');
        setStatus('error');
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.error || err?.message || 'Failed to create console terminal session.'
      );
      setStatus('error');
    }
  };

  const handleClose = () => {
    disconnect();
    teardownTerminal();
    setStatus('idle');
    setError(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      disconnect();
      teardownTerminal();
      setStatus('idle');
      setError(null);
      setSafetyNotice(null);
      return;
    }

    ensureTerminal();
    startSession();

    return () => {
      disconnect();
      teardownTerminal();
    };
  }, [isOpen, serverId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl h-[80vh] min-h-[420px] rounded-xl border border-gray-700 bg-[#0f172a] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-700 px-4 py-3 bg-[#111827]">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-white truncate">
              Game Console Terminal - {serverName}
            </h3>
            <p className="text-xs text-gray-400">
              Write commands directly in the game console session
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="p-2 rounded text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
              aria-label="Close terminal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 text-sm text-red-300 border-b border-red-500/30 bg-red-500/10">
            {error}
          </div>
        )}
        {safetyNotice && (
          <div className="px-4 py-2 text-sm text-amber-200 border-b border-amber-500/30 bg-amber-500/10">
            {safetyNotice}
          </div>
        )}

        <div className="flex-1 min-h-0 bg-[#020617]">
          <div className="flex h-full w-full items-stretch">
            <div className="h-full w-full">
              <div ref={containerRef} className="h-full w-full p-1" />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-700 bg-[#111827] px-4 py-2 text-xs text-gray-400 flex items-center gap-2">
          <Terminal className="w-3 h-3" />
          This terminal is attached to the tmux game console session.
        </div>
      </div>
    </div>
  );
}

