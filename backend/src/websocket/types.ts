import type WebSocket from 'ws';

export type SubscriptionChannel =
    | 'logs'
    | 'actions'
    | 'metrics'
    | 'install'
    | 'status'
    | 'servers'
    | 'system-metrics'
    | 'console-status';

export interface SubscriptionsState {
    logs: Set<number>;
    metrics: Set<number>;
    install: Set<number>;
    status: Set<number>;
    actions: Set<number>;
    consoleStatus: Set<number>;
    servers: boolean;
    systemMetrics: boolean;
}

export interface AuthenticatedWebSocket extends WebSocket {
    userId?: number;
    isAlive?: boolean;
    isRoot?: boolean;
    accountValidatedAt?: number;
    authTimeout?: ReturnType<typeof setTimeout>;

    subs?: SubscriptionsState;

    logStreams?: Record<number, { stop: () => void }>;

    terminalSubs?: Record<string, () => void>;
}

export type WSMessage =
    | { type: 'auth'; token?: string; data?: { token?: string } }
    | { type: 'subscribe:servers' }
    | { type: 'subscribe:install'; serverId: number }
    | { type: 'subscribe:logs'; serverId: number; data?: { limit?: number } }
    | { type: 'subscribe:actions'; serverId: number; data?: { limit?: number } }
    | { type: 'subscribe:metrics'; serverId: number; data?: { limit?: number } }
    | { type: 'subscribe:system-metrics'; data?: { limit?: number } }
    | { type: 'subscribe:console-status'; serverId: number }
    | { type: 'terminal:attach'; sessionId: string }
    | { type: 'terminal:input'; sessionId: string; dataB64: string }
    | { type: 'terminal:resize'; sessionId: string; cols: number; rows: number }
    | { type: 'unsubscribe'; channel: SubscriptionChannel; serverId?: number }
    | { type: 'ping' }
    | { type: string;[key: string]: unknown };
