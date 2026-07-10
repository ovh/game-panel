import { WS_URL } from './runtime';
import { parseRealtimeMessage } from './realtimeMessages';

type WebSocketListener = (data: any) => void;

export type RealtimeConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
type ConnectionStatusListener = (status: RealtimeConnectionStatus) => void;

export class RealtimeGateway {
  private ws: WebSocket | null = null;
  private wsConnectPromise: Promise<void> | null = null;
  private allowReconnect = true;
  private reconnectAttempts = 0;
  private readonly baseReconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private status: RealtimeConnectionStatus = 'closed';
  private statusListeners = new Set<ConnectionStatusListener>();
  private pendingMetricsSubscriptions = new Set<number>();
  private metricsHistoryLimitByServer = new Map<number, number>();
  private pendingLogsSubscriptions = new Set<number>();
  private logsHistoryLimitByServer = new Map<number, number>();
  private pendingActionsSubscriptions = new Set<number>();
  private pendingInstallSubscriptions = new Set<number>();
  private pendingSystemMetricsSubscription = false;
  private pendingSystemMetricsHistoryLimit: number | null = null;
  private pendingServersSubscription = false;
  private wsAuthed = false;
  private wsListeners = new Set<WebSocketListener>();

  constructor(private readonly getAuthToken: () => string | null) {}

  resetState() {
    this.pendingMetricsSubscriptions.clear();
    this.metricsHistoryLimitByServer.clear();
    this.pendingLogsSubscriptions.clear();
    this.logsHistoryLimitByServer.clear();
    this.pendingActionsSubscriptions.clear();
    this.pendingInstallSubscriptions.clear();
    this.pendingSystemMetricsSubscription = false;
    this.pendingSystemMetricsHistoryLimit = null;
    this.pendingServersSubscription = false;
    this.wsListeners.clear();
  }

  getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  /** Subscribe to connection-status changes. Immediately invokes with the current
   *  status and returns an unsubscribe function. */
  onStatusChange(listener: ConnectionStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(next: RealtimeConnectionStatus) {
    if (this.status === next) return;
    this.status = next;
    this.statusListeners.forEach((listener) => {
      try {
        listener(next);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Connection status listener error:', error);
      }
    });
  }

  private sendWebSocketAuth(ws: WebSocket, token: string) {
    ws.send(
      JSON.stringify({
        type: 'auth',
        token,
      })
    );
  }

  private flushPendingSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.wsAuthed) return;

    if (this.pendingMetricsSubscriptions.size > 0) {
      this.pendingMetricsSubscriptions.forEach((serverId) => {
        const limit = this.metricsHistoryLimitByServer.get(serverId);
        this.ws!.send(
          JSON.stringify({
            type: 'subscribe:metrics',
            serverId,
            data: typeof limit === 'number' ? { limit } : undefined,
          })
        );
      });
    }

    if (this.pendingLogsSubscriptions.size > 0) {
      this.pendingLogsSubscriptions.forEach((serverId) => {
        const limit = this.logsHistoryLimitByServer.get(serverId);
        this.ws!.send(
          JSON.stringify({
            type: 'subscribe:logs',
            serverId,
            data: typeof limit === 'number' ? { limit } : undefined,
          })
        );
      });
    }

    if (this.pendingActionsSubscriptions.size > 0) {
      this.pendingActionsSubscriptions.forEach((serverId) => {
        this.ws!.send(
          JSON.stringify({
            type: 'subscribe:actions',
            serverId,
          })
        );
      });
    }

    if (this.pendingInstallSubscriptions.size > 0) {
      this.pendingInstallSubscriptions.forEach((serverId) => {
        this.ws!.send(
          JSON.stringify({
            type: 'subscribe:install',
            serverId,
          })
        );
      });
    }

    if (this.pendingServersSubscription) {
      this.ws!.send(
        JSON.stringify({
          type: 'subscribe:servers',
        })
      );
    }

    if (this.pendingSystemMetricsSubscription) {
      this.ws!.send(
        JSON.stringify({
          type: 'subscribe:system-metrics',
          data:
            typeof this.pendingSystemMetricsHistoryLimit === 'number'
              ? { limit: this.pendingSystemMetricsHistoryLimit }
              : undefined,
        })
      );
    }
  }

  connect(onMessage?: WebSocketListener): Promise<void> {
    if (onMessage) {
      this.wsListeners.add(onMessage);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.wsConnectPromise) {
      return this.wsConnectPromise;
    }

    const token = this.getAuthToken();
    if (!token) {
      return Promise.reject(new Error('No authentication token'));
    }

    this.allowReconnect = true;
    this.wsAuthed = false;
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const connectPromise = new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(WS_URL);
        this.ws = ws;

        ws.onmessage = (event) => {
          let data: any;
          try {
            data = JSON.parse(event.data);
          } catch (error) {
            // Ignore malformed/non-JSON frames rather than throwing in the message pump.
            if (import.meta.env.DEV) console.error('Failed to parse WebSocket frame:', error);
            return;
          }
          if (import.meta.env.DEV) {
            const check = parseRealtimeMessage(data);
            if (!check.ok) {
              console.warn('[WS] Unexpected frame shape (no string `type`):', data);
            } else if (!check.knownType) {
              console.warn('[WS] Unknown message type:', check.message?.type);
            }
          }
          const isAuthEvent = data?.type === 'auth:success' || data?.type === 'auth:ok';
          if (isAuthEvent && !this.wsAuthed) {
            this.wsAuthed = true;
            this.flushPendingSubscriptions();
          }

          if (this.wsListeners.size > 0) {
            this.wsListeners.forEach((listener) => {
              try {
                listener(data);
              } catch (error) {
                if (import.meta.env.DEV) console.error('WebSocket listener error:', error);
              }
            });
          }
        };

        ws.onopen = () => {
          this.reconnectAttempts = 0;
          if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          this.setStatus('open');
          this.sendWebSocketAuth(ws, token);
          resolve();
        };

        ws.onerror = (error) => {
          if (import.meta.env.DEV) console.error('WebSocket error:', error);
          if (this.wsConnectPromise) {
            reject(error);
          }
        };

        ws.onclose = () => {
          if (this.ws === ws) {
            this.ws = null;
          }
          this.wsAuthed = false;
          this.wsConnectPromise = null;
          if (this.allowReconnect) {
            this.setStatus('reconnecting');
            this.attemptReconnect();
          } else {
            this.setStatus('closed');
          }
        };
      } catch (error) {
        this.wsConnectPromise = null;
        reject(error);
      }
    });
    this.wsConnectPromise = connectPromise;

    void connectPromise.finally(() => {
      if (this.wsConnectPromise === connectPromise) {
        this.wsConnectPromise = null;
      }
    });

    return connectPromise;
  }

  private attemptReconnect() {
    if (!this.allowReconnect || !this.getAuthToken()) {
      this.setStatus('closed');
      return;
    }
    if (this.reconnectTimer !== null) return;

    this.reconnectAttempts++;
    // Capped exponential backoff with jitter; retries indefinitely.
    const exponent = Math.min(this.reconnectAttempts, 6);
    const delay =
      Math.min(this.maxReconnectDelay, this.baseReconnectDelay * 2 ** exponent) +
      Math.floor(Math.random() * 1000);

    if (import.meta.env.DEV) {
      console.log(`Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        if (import.meta.env.DEV) console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(JSON.stringify(message));
    }
  }

  addListener(listener: WebSocketListener) {
    this.wsListeners.add(listener);
  }

  removeListener(listener: WebSocketListener) {
    this.wsListeners.delete(listener);
  }

  subscribeLogs(serverId: number, limit?: number) {
    this.pendingLogsSubscriptions.add(serverId);
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      const normalizedLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
      this.logsHistoryLimitByServer.set(serverId, normalizedLimit);
    }

    const effectiveLimit = this.logsHistoryLimitByServer.get(serverId);

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe:logs',
          serverId,
          data: typeof effectiveLimit === 'number' ? { limit: effectiveLimit } : undefined,
        })
      );
    }
  }

  unsubscribeLogs(serverId: number) {
    this.pendingLogsSubscriptions.delete(serverId);
    this.logsHistoryLimitByServer.delete(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          channel: 'logs',
          serverId,
        })
      );
    }
  }

  subscribeActions(serverId: number, limit?: number) {
    this.pendingActionsSubscriptions.add(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe:actions',
          serverId,
          data: typeof limit === 'number' ? { limit } : undefined,
        })
      );
    }
  }

  unsubscribeActions(serverId: number) {
    this.pendingActionsSubscriptions.delete(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          channel: 'actions',
          serverId,
        })
      );
    }
  }

  subscribeMetrics(serverId: number, limit?: number) {
    this.pendingMetricsSubscriptions.add(serverId);
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      const normalizedLimit = Math.min(Math.max(Math.floor(limit), 1), 2000);
      this.metricsHistoryLimitByServer.set(serverId, normalizedLimit);
    }

    const effectiveLimit = this.metricsHistoryLimitByServer.get(serverId);

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe:metrics',
          serverId,
          data: typeof effectiveLimit === 'number' ? { limit: effectiveLimit } : undefined,
        })
      );
    }
  }

  unsubscribeMetrics(serverId: number) {
    this.pendingMetricsSubscriptions.delete(serverId);
    this.metricsHistoryLimitByServer.delete(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          channel: 'metrics',
          serverId,
        })
      );
    }
  }

  subscribeSystemMetrics(limit?: number) {
    this.pendingSystemMetricsSubscription = true;
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      this.pendingSystemMetricsHistoryLimit = Math.min(Math.max(Math.floor(limit), 1), 2000);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe:system-metrics',
          data:
            typeof this.pendingSystemMetricsHistoryLimit === 'number'
              ? { limit: this.pendingSystemMetricsHistoryLimit }
              : undefined,
        })
      );
    }
  }

  unsubscribeSystemMetrics() {
    this.pendingSystemMetricsSubscription = false;
    this.pendingSystemMetricsHistoryLimit = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          channel: 'system-metrics',
        })
      );
    }
  }

  subscribeInstall(serverId: number) {
    this.pendingInstallSubscriptions.add(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe:install',
          serverId,
        })
      );
    }
  }

  unsubscribeInstall(serverId: number) {
    this.pendingInstallSubscriptions.delete(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          channel: 'install',
          serverId,
        })
      );
    }
  }

  subscribeServers() {
    this.pendingServersSubscription = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe:servers',
        })
      );
    }
  }

  createAuthenticatedWebSocket(): Promise<WebSocket> {
    const token = this.getAuthToken();
    if (!token) {
      return Promise.reject(new Error('No authentication token'));
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      let settled = false;

      const cleanup = () => {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
      };

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      ws.onopen = () => {
        this.sendWebSocketAuth(ws, token);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === 'auth:success' || data?.type === 'auth:ok') {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(ws);
            return;
          }

          if (data?.type === 'error') {
            fail(data?.error || 'WebSocket authentication failed');
            try {
              ws.close();
            } catch {
              // Ignore close errors on partially-open sockets.
            }
          }
        } catch (error) {
          fail(error);
        }
      };

      ws.onerror = () => {
        fail(new Error('WebSocket error while authenticating'));
      };

      ws.onclose = (event) => {
        if (!settled) {
          fail(new Error(event.reason || 'WebSocket closed before authentication'));
        }
      };
    });
  }

  close() {
    this.allowReconnect = false;
    this.wsAuthed = false;
    this.wsConnectPromise = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('closed');
  }

  getWebSocketUrl(): string {
    return WS_URL;
  }
}
