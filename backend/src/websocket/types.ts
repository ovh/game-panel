import type WebSocket from 'ws';
import type { SerializedFileTransferJob } from '../database/repositories/fileTransferJobRepository.js';
import type { InstallStep, InstallStatus } from '../services/installPlan.js';
import type {
    SerializedGameServerWithInstallProgress,
    SerializedInstallationInteraction,
    SerializedServerAction,
} from '../utils/apiSerialization.js';
import type { SerializedMetricPoint } from './metricsSerialization.js';

export type SubscriptionChannel =
    | 'logs'
    | 'actions'
    | 'metrics'
    | 'install'
    | 'status'
    | 'servers'
    | 'system-metrics'
    | 'file-transfers';

export interface SubscriptionsState {
    logs: Set<number>;
    metrics: Set<number>;
    install: Set<number>;
    status: Set<number>;
    actions: Set<number>;
    fileTransfers: Set<number>;
    servers: boolean;
    systemMetrics: boolean;
}

export interface AuthenticatedWebSocket extends WebSocket {
    userId?: number;
    isAlive?: boolean;
    isRoot?: boolean;
    tokenVersion?: number;
    accountValidatedAt?: number;
    authTimeout?: ReturnType<typeof setTimeout>;
    gpClientId?: string;

    subs?: SubscriptionsState;

    logStreams?: Record<number, { stop: () => void }>;

    terminalSubs?: Record<string, () => void>;
}

export type WsLimitData = {
    limit?: number;
};

export type WsAuthMessage = { type: 'auth'; token?: string; data?: { token?: string } };
export type WsSubscribeServersMessage = { type: 'subscribe:servers' };
export type WsSubscribeInstallMessage = { type: 'subscribe:install'; serverId: number };
export type WsSubscribeLogsMessage = { type: 'subscribe:logs'; serverId: number; data?: WsLimitData };
export type WsSubscribeActionsMessage = { type: 'subscribe:actions'; serverId: number; data?: WsLimitData };
export type WsSubscribeMetricsMessage = { type: 'subscribe:metrics'; serverId: number; data?: WsLimitData };
export type WsSubscribeSystemMetricsMessage = { type: 'subscribe:system-metrics'; data?: WsLimitData };
export type WsSubscribeFileTransfersMessage = { type: 'subscribe:file-transfers'; serverId: number; data?: WsLimitData };
export type WsTerminalAttachMessage = { type: 'terminal:attach'; sessionId: string; serverId?: number };
export type WsTerminalInputMessage = { type: 'terminal:input'; sessionId: string; dataB64: string; serverId?: number };
export type WsTerminalResizeMessage = { type: 'terminal:resize'; sessionId: string; cols: number; rows: number; serverId?: number };
export type WsTerminalMessage = WsTerminalAttachMessage | WsTerminalInputMessage | WsTerminalResizeMessage;
export type WsUnsubscribeMessage = { type: 'unsubscribe'; channel: SubscriptionChannel; serverId?: number };
export type WsPingMessage = { type: 'ping' };

export type WSMessage =
    | WsAuthMessage
    | WsSubscribeServersMessage
    | WsSubscribeInstallMessage
    | WsSubscribeLogsMessage
    | WsSubscribeActionsMessage
    | WsSubscribeMetricsMessage
    | WsSubscribeSystemMetricsMessage
    | WsSubscribeFileTransfersMessage
    | WsTerminalMessage
    | WsUnsubscribeMessage
    | WsPingMessage;

type Timestamped = {
    timestamp: string;
};

type MetricPayload = {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    network: {
        in: number;
        out: number;
    };
};

type MetricsHistoryMeta = {
    window: '24h';
    downsample: string;
    rawCount: number;
    sentCount: number;
};

export type OutgoingWebSocketMessage =
    | { type: 'error'; error: string }
    | { type: 'auth:success' }
    | { type: 'pong' }
    | ({ type: 'servers:subscribed' } & Timestamped)
    | ({ type: 'servers:snapshot'; servers: SerializedGameServerWithInstallProgress[] } & Timestamped)
    | ({ type: 'servers:created' | 'servers:updated'; server: SerializedGameServerWithInstallProgress } & Timestamped)
    | ({ type: 'servers:deleted'; serverId: number } & Timestamped)
    | ({ type: 'logs:history'; serverId: number; logs: string[]; limit: number } & Timestamped)
    | ({ type: 'logs:subscribed'; serverId: number } & Timestamped)
    | ({ type: 'logs:new'; serverId: number; lines: string[] } & Timestamped)
    | ({ type: 'actions:history'; serverId: number; actions: SerializedServerAction[]; limit: number } & Timestamped)
    | ({ type: 'actions:subscribed'; serverId: number } & Timestamped)
    | ({ type: 'actions:new'; serverId: number; action: SerializedServerAction | (Omit<SerializedServerAction, 'id'> & { id: number | null }) } & Timestamped)
    | ({ type: 'install:plan'; serverId: number; steps: InstallStep[] } & Timestamped)
    | ({ type: 'install:progress'; serverId: number; progress: number; status: InstallStatus; errorMessage: string | null } & Timestamped)
    | ({ type: 'install:interaction' } & Omit<SerializedInstallationInteraction, 'createdAt' | 'updatedAt'> & Partial<Pick<SerializedInstallationInteraction, 'createdAt' | 'updatedAt'>> & Timestamped)
    | ({ type: 'install:subscribed'; serverId: number } & Timestamped)
    | ({ type: 'file-transfer:snapshot'; serverId: number; jobs: SerializedFileTransferJob[]; limit: number } & Timestamped)
    | ({ type: 'file-transfer:subscribed'; serverId: number } & Timestamped)
    | ({ type: 'file-transfer:progress'; serverId: number; job: SerializedFileTransferJob } & Timestamped)
    | ({ type: 'metrics:history'; serverId: number; metrics: SerializedMetricPoint[]; limit: number; meta?: MetricsHistoryMeta } & Timestamped)
    | ({ type: 'metrics:subscribed'; serverId: number } & Timestamped)
    | ({ type: 'metrics:update'; serverId: number; metrics: MetricPayload } & Timestamped)
    | ({ type: 'system-metrics:history'; metrics: SerializedMetricPoint[]; limit: number; meta?: MetricsHistoryMeta } & Timestamped)
    | ({ type: 'system-metrics:subscribed' } & Timestamped)
    | ({ type: 'system-metrics:update'; metrics: MetricPayload } & Timestamped)
    | ({ type: 'system:rebooting'; byUserId: number | null } & Timestamped)
    | { type: 'unsubscribed'; channel: SubscriptionChannel; serverId?: number }
    | { type: 'terminal:error'; error: string }
    | { type: 'terminal:attached'; sessionId: string }
    | { type: 'terminal:output'; sessionId: string; dataB64: string }
    | { type: 'terminal:closed'; sessionId: string };
