import type { RawData } from 'ws';
import { parsePositiveIntId } from '../utils/ids.js';
import type { SubscriptionChannel, WSMessage, WsLimitData } from './types.js';

const SUBSCRIPTION_CHANNELS = new Set<SubscriptionChannel>([
    'logs',
    'actions',
    'metrics',
    'install',
    'status',
    'servers',
    'system-metrics',
    'file-transfers',
]);

function badMessage(message: string): never {
    throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseJson(data: RawData): unknown {
    const text = typeof data === 'string' ? data : data.toString();
    return JSON.parse(text);
}

function requireMessageObject(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) badMessage('WebSocket message must be an object');
    return value;
}

function dataObject(message: Record<string, unknown>): Record<string, unknown> | undefined {
    if (message.data === undefined) return undefined;
    if (!isRecord(message.data)) badMessage('message.data must be an object');
    return message.data;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') badMessage(`${fieldName} must be a string`);
    return value;
}

function requireString(value: unknown, fieldName: string): string {
    const parsed = optionalString(value, fieldName);
    if (!parsed) badMessage(`${fieldName} is required`);
    return parsed;
}

function optionalPositiveInt(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = parsePositiveIntId(value);
    if (!parsed) badMessage(`${fieldName} must be a positive integer`);
    return parsed;
}

function requirePositiveInt(value: unknown, fieldName: string): number {
    const parsed = optionalPositiveInt(value, fieldName);
    if (!parsed) badMessage(`${fieldName} is required`);
    return parsed;
}

function serverIdFromMessage(message: Record<string, unknown>): number {
    const data = dataObject(message);
    return requirePositiveInt(message.serverId ?? data?.serverId, 'serverId');
}

function optionalServerIdFromMessage(message: Record<string, unknown>): number | undefined {
    const data = dataObject(message);
    return optionalPositiveInt(message.serverId ?? data?.serverId, 'serverId');
}

function optionalLimitData(message: Record<string, unknown>): WsLimitData | undefined {
    const data = dataObject(message);
    if (!data || data.limit === undefined || data.limit === null) return undefined;

    return {
        limit: requirePositiveInt(data.limit, 'data.limit'),
    };
}

function normalizeAuthMessage(message: Record<string, unknown>): WSMessage {
    const data = dataObject(message);
    const token = optionalString(message.token ?? data?.token, 'token');
    return token ? { type: 'auth', token } : { type: 'auth' };
}

function normalizeTerminalAttach(message: Record<string, unknown>): WSMessage {
    return {
        type: 'terminal:attach',
        sessionId: requireString(message.sessionId, 'sessionId'),
        serverId: optionalServerIdFromMessage(message),
    };
}

function normalizeTerminalInput(message: Record<string, unknown>): WSMessage {
    return {
        type: 'terminal:input',
        sessionId: requireString(message.sessionId, 'sessionId'),
        dataB64: requireString(message.dataB64, 'dataB64'),
        serverId: optionalServerIdFromMessage(message),
    };
}

function normalizeTerminalResize(message: Record<string, unknown>): WSMessage {
    return {
        type: 'terminal:resize',
        sessionId: requireString(message.sessionId, 'sessionId'),
        cols: requirePositiveInt(message.cols, 'cols'),
        rows: requirePositiveInt(message.rows, 'rows'),
        serverId: optionalServerIdFromMessage(message),
    };
}

function normalizeUnsubscribe(message: Record<string, unknown>): WSMessage {
    const rawChannel = requireString(message.channel, 'channel');
    if (!SUBSCRIPTION_CHANNELS.has(rawChannel as SubscriptionChannel)) {
        badMessage('channel is invalid');
    }

    return {
        type: 'unsubscribe',
        channel: rawChannel as SubscriptionChannel,
        serverId: optionalServerIdFromMessage(message),
    };
}

export function parseIncomingWebSocketMessage(data: RawData): WSMessage {
    const message = requireMessageObject(parseJson(data));
    const type = requireString(message.type, 'type');

    switch (type) {
        case 'auth':
            return normalizeAuthMessage(message);
        case 'subscribe:servers':
            return { type };
        case 'subscribe:install':
            return { type, serverId: serverIdFromMessage(message) };
        case 'subscribe:logs':
            return { type, serverId: serverIdFromMessage(message), data: optionalLimitData(message) };
        case 'subscribe:actions':
            return { type, serverId: serverIdFromMessage(message), data: optionalLimitData(message) };
        case 'subscribe:metrics':
            return { type, serverId: serverIdFromMessage(message), data: optionalLimitData(message) };
        case 'subscribe:system-metrics':
            return { type, data: optionalLimitData(message) };
        case 'subscribe:file-transfers':
            return { type, serverId: serverIdFromMessage(message), data: optionalLimitData(message) };
        case 'terminal:attach':
            return normalizeTerminalAttach(message);
        case 'terminal:input':
            return normalizeTerminalInput(message);
        case 'terminal:resize':
            return normalizeTerminalResize(message);
        case 'unsubscribe':
            return normalizeUnsubscribe(message);
        case 'ping':
            return { type };
        default:
            badMessage('Unknown message type');
    }
}
