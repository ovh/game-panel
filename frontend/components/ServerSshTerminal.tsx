import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AppButton } from '../src/ui/components';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { apiClient } from '../utils/api';
import { isServerUpLike } from '../utils/serverRuntime';

const style = document.createElement('style');
style.textContent = `
  .xterm-viewport {
    overflow-y: auto !important;
    scrollbar-width: none;
  }
  .xterm-viewport::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(style);
}

interface ServerSshTerminalProps {
  serverId?: number | null;
  serverName: string;
  serverStatus?: string | null;
}

type TerminalStatus = 'idle' | 'creating' | 'connecting' | 'connected' | 'closed' | 'error';

export function ServerSshTerminal({ serverId, serverStatus }: ServerSshTerminalProps) {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const encoderRef = useRef<TextEncoder>(new TextEncoder());

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

    const nextCols = cols ?? term.cols;
    const nextRows = rows ?? term.rows;

    ws.send(
      JSON.stringify({
        type: 'terminal:resize',
        sessionId,
        cols: nextCols,
        rows: nextRows,
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
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    sessionIdRef.current = null;
    setStatus('closed');
  };

  const ensureTerminal = () => {
    if (!containerRef.current || termRef.current) return;

    const term = new XTerm({
      fontSize: 14,
      lineHeight: 1.35,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 2000,
      fontWeight: 500,
      fontWeightBold: 600,
      fontFamily:
        '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: {
        background: '#0b1220',
        foreground: '#eaf2ff',
        cursor: 'var(--color-cyan-400)',
        selectionBackground: '#1f3b5b',
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

    dataDisposableRef.current = term.onData((data: string) => {
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
      setError('Missing server id for terminal session.');
      return;
    }

    if (status === 'creating' || status === 'connecting' || status === 'connected') return;

    setError(null);
    setStatus('creating');
    ensureTerminal();

    try {
      const { sessionId } = await apiClient.createTerminalSession(serverId);
      sessionIdRef.current = sessionId;
      const ws = await apiClient.createAuthenticatedWebSocket();
      wsRef.current = ws;

      setStatus('connecting');

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'terminal:attached') {
            setStatus('connected');
            sendResize();
            termRef.current?.focus();
            return;
          }

          if (message.type === 'terminal:output') {
            const data = decodeBase64(message.dataB64 || '');
            if (data.length) termRef.current?.write(data);
            return;
          }

          if (message.type === 'terminal:closed') {
            setStatus('closed');
            return;
          }

          if (message.type === 'terminal:error') {
            setError(message.error || 'Terminal error');
            setStatus('error');
          }
        } catch {}
      };

      ws.onerror = () => {
        setError('WebSocket error while connecting terminal.');
        setStatus('error');
      };

      ws.onclose = () => {
        setStatus('closed');
      };

      ws.send(JSON.stringify({ type: 'terminal:attach', sessionId }));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to create terminal session.');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!disclaimerAccepted) return;
    startSession();

    return () => {
      disconnect();
      teardownTerminal();
    };
  }, [disclaimerAccepted]);

  useEffect(() => {
    disconnect();
    teardownTerminal();
    setStatus('idle');
    setError(null);
    setDisclaimerAccepted(false);
  }, [serverId]);


  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-bold text-white">Terminal</h3>
          </div>
        </div>
      </div>

      {!serverId && (
        <div className="bg-gp-surface-elevated border border-gray-700 rounded-lg p-5 text-sm text-gray-300">
          Terminal access is not available until this server is fully provisioned.
        </div>
      )}

      {serverId && !isServerUpLike(serverStatus) && (
        <div className="bg-gp-surface-elevated border border-amber-500/40 rounded-lg p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-200">The server must be <strong>running</strong> to open a terminal session.</p>
        </div>
      )}

      {serverId && isServerUpLike(serverStatus) && !disclaimerAccepted ? (
        <div className="bg-gp-surface-elevated border border-yellow-500/40 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-yellow-200 font-semibold mb-2">Advanced feature warning</p>
              <p className="text-sm text-gray-300">
                This terminal gives full shell access inside the server container. Misuse can
                break the game server, delete files, or expose sensitive data. Use with caution.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <AppButton
                  tone="primary"
                  onClick={() => setDisclaimerAccepted(true)}
                  className="px-4 py-2 rounded text-sm font-semibold bg-yellow-500/90 text-gray-900 hover:bg-yellow-400 transition-colors"
                >
                  I understand, open terminal
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      ) : serverId && isServerUpLike(serverStatus) ? (
        <div className="flex flex-col flex-1 min-h-0">
          {error && <div className="mb-3 text-xs text-red-300">{error}</div>}
          <div className="relative flex-1 min-h-[360px] border border-gray-700 rounded-2xl overflow-hidden bg-gp-surface-input shadow-[0_0_0_1px_rgba(17,24,39,0.6),0_20px_40px_-24px_rgba(15,23,42,0.8)]">
            <div className="h-full w-full p-2 sm:p-3">
              <div ref={containerRef} className="h-full w-full" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

