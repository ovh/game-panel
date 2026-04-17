import { WS_URL } from './runtime';

type WebSocketListener = (data: any) => void;

export class RealtimeGateway {
  private ws: WebSocket | null = null;
  private wsConnectPromise: Promise<void> | null = null;
  private allowReconnect = true;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 3000;
  private pendingConsoleStatusSubscriptions = new Set<number>();
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
    this.pendingConsoleStatusSubscriptions.clear();
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

    if (this.pendingConsoleStatusSubscriptions.size > 0) {
      this.pendingConsoleStatusSubscriptions.forEach((serverId) => {
        this.ws!.send(
          JSON.stringify({
            type: 'subscribe:console-status',
            serverId,
          })
        );
      });
    }

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

    const connectPromise = new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(WS_URL);
        this.ws = ws;

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
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
                console.error('WebSocket listener error:', error);
              }
            });
          }
        };

        ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.sendWebSocketAuth(ws, token);
          resolve();
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
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
            this.attemptReconnect();
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
    if (!this.allowReconnect || !this.getAuthToken()) return;
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect WebSocket (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );
      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
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

  subscribeConsoleStatus(serverId: number) {
    this.pendingConsoleStatusSubscriptions.add(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe:console-status',
          serverId,
        })
      );
    }
  }

  unsubscribeConsoleStatus(serverId: number) {
    this.pendingConsoleStatusSubscriptions.delete(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsAuthed) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          channel: 'console-status',
          serverId,
        })
      );
    }
  }

  sendServerAction(serverId: number, action: 'start' | 'stop' | 'restart') {
    this.send({
      type: `action:${action}`,
      serverId,
    });
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getWebSocketUrl(): string {
    return WS_URL;
  }
}
