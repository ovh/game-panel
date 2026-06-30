import { isIP } from 'node:net';
import type { GameServerRow } from '../../../../types/gameServer.js';
import {
    sendGameConsoleCommand,
    type GameConsoleCommandResult,
} from '../../../../services/gameConsole.js';
import { toIsoTimestampIfValid } from '../../../../utils/time.js';
import {
    assertOvhcloudMinecraftJavaServer,
    type GameServerWithContainer,
    invalidInput,
    readRequiredTextFile,
} from './shared.js';
import { readMinecraftJavaPropertiesMap } from './settings.js';

export type MinecraftOperator = {
    uuid: string;
    name: string;
    level: number | null;
    bypassesPlayerLimit: boolean | null;
};

export type MinecraftWhitelistEntry = {
    uuid: string;
    name: string;
};

export type MinecraftPlayerBan = {
    uuid: string;
    name: string;
    created: string | null;
    source: string | null;
    expires: string | null;
    reason: string | null;
};

export type MinecraftIpBan = {
    ip: string;
    created: string | null;
    source: string | null;
    expires: string | null;
    reason: string | null;
};

const PLAYER_NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const MAX_REASON_LENGTH = 512;

function normalizePlayerName(value: unknown, fieldName = 'name'): string {
    if (typeof value !== 'string') invalidInput(`${fieldName} must be a string`);

    const name = value.trim();
    if (!PLAYER_NAME_RE.test(name)) {
        invalidInput(`${fieldName} must be a valid Minecraft player name`);
    }

    return name;
}

function normalizeReason(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') invalidInput('reason must be a string');

    const reason = value.trim();
    if (!reason) return undefined;
    if (reason.length > MAX_REASON_LENGTH || /[\0\r\n]/.test(reason)) {
        invalidInput('reason is invalid');
    }

    return reason;
}

function normalizeIp(value: unknown, fieldName = 'ip'): string {
    if (typeof value !== 'string') invalidInput(`${fieldName} must be a string`);

    const ip = value.trim();
    if (!isIP(ip)) invalidInput(`${fieldName} must be a valid IP address`);
    return ip;
}

function normalizeBanIpTarget(value: unknown): string {
    if (typeof value !== 'string') invalidInput('target must be a string');

    const target = value.trim();
    if (isIP(target)) return target;
    return normalizePlayerName(target, 'target');
}

async function readOptionalJsonArray<T>(
    server: GameServerRow,
    apiPath: string,
    mapper: (entry: unknown) => T | null
): Promise<T[]> {
    assertOvhcloudMinecraftJavaServer(server);

    let content: string;
    try {
        content = await readRequiredTextFile(server.id, apiPath);
    } catch (error: any) {
        if (error?.statusCode === 404 || error?.code === 'ENOENT') return [];
        throw error;
    }

    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        throw Object.assign(new Error(`${apiPath} contains invalid JSON`), { statusCode: 500 });
    }

    if (!Array.isArray(raw)) {
        throw Object.assign(new Error(`${apiPath} must contain a JSON array`), { statusCode: 500 });
    }

    return raw.map(mapper).filter((entry): entry is T => Boolean(entry));
}

function stringField(entry: Record<string, unknown>, key: string): string | null {
    const value = entry[key];
    return typeof value === 'string' ? value : null;
}

function numberField(entry: Record<string, unknown>, key: string): number | null {
    const value = entry[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanField(entry: Record<string, unknown>, key: string): boolean | null {
    const value = entry[key];
    return typeof value === 'boolean' ? value : null;
}

function dateLikeField(entry: Record<string, unknown>, key: string): string | null {
    const value = stringField(entry, key);
    if (!value) return null;
    return toIsoTimestampIfValid(value) ?? value;
}

function asRecord(entry: unknown): Record<string, unknown> | null {
    return entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry as Record<string, unknown>
        : null;
}

export async function listMinecraftOperators(server: GameServerRow): Promise<MinecraftOperator[]> {
    return readOptionalJsonArray(server, '/ops.json', (entry) => {
        const record = asRecord(entry);
        if (!record) return null;
        const uuid = stringField(record, 'uuid');
        const name = stringField(record, 'name');
        if (!uuid || !name) return null;
        return {
            uuid,
            name,
            level: numberField(record, 'level'),
            bypassesPlayerLimit: booleanField(record, 'bypassesPlayerLimit'),
        };
    });
}

export async function listMinecraftWhitelist(server: GameServerRow): Promise<{
    enabled: boolean | null;
    players: MinecraftWhitelistEntry[];
}> {
    const players = await readOptionalJsonArray(server, '/whitelist.json', (entry) => {
        const record = asRecord(entry);
        if (!record) return null;
        const uuid = stringField(record, 'uuid');
        const name = stringField(record, 'name');
        if (!uuid || !name) return null;
        return { uuid, name };
    });

    let enabled: boolean | null = null;
    try {
        const value = (await readMinecraftJavaPropertiesMap(server)).get('white-list');
        if (typeof value === 'string') enabled = value.trim().toLowerCase() === 'true';
    } catch (error: any) {
        if (error?.statusCode !== 404 && error?.code !== 'ENOENT') throw error;
    }

    return { enabled, players };
}

export async function listMinecraftPlayerBans(server: GameServerRow): Promise<MinecraftPlayerBan[]> {
    return readOptionalJsonArray(server, '/banned-players.json', (entry) => {
        const record = asRecord(entry);
        if (!record) return null;
        const uuid = stringField(record, 'uuid');
        const name = stringField(record, 'name');
        if (!uuid || !name) return null;
        return {
            uuid,
            name,
            created: dateLikeField(record, 'created'),
            source: stringField(record, 'source'),
            expires: dateLikeField(record, 'expires'),
            reason: stringField(record, 'reason'),
        };
    });
}

export async function listMinecraftIpBans(server: GameServerRow): Promise<MinecraftIpBan[]> {
    return readOptionalJsonArray(server, '/banned-ips.json', (entry) => {
        const record = asRecord(entry);
        if (!record) return null;
        const ip = stringField(record, 'ip');
        if (!ip) return null;
        return {
            ip,
            created: dateLikeField(record, 'created'),
            source: stringField(record, 'source'),
            expires: dateLikeField(record, 'expires'),
            reason: stringField(record, 'reason'),
        };
    });
}

export async function runMinecraftOperatorCommand(
    server: GameServerWithContainer,
    action: 'op' | 'deop',
    rawName: unknown
): Promise<GameConsoleCommandResult> {
    assertOvhcloudMinecraftJavaServer(server);
    const name = normalizePlayerName(rawName);
    return sendGameConsoleCommand(server, `${action} ${name}`);
}

export async function runMinecraftWhitelistEnabledCommand(
    server: GameServerWithContainer,
    rawEnabled: unknown
): Promise<GameConsoleCommandResult> {
    assertOvhcloudMinecraftJavaServer(server);
    if (typeof rawEnabled !== 'boolean') invalidInput('enabled must be a boolean');
    return sendGameConsoleCommand(server, `whitelist ${rawEnabled ? 'on' : 'off'}`);
}

export async function runMinecraftWhitelistPlayerCommand(
    server: GameServerWithContainer,
    action: 'add' | 'remove',
    rawName: unknown
): Promise<GameConsoleCommandResult> {
    assertOvhcloudMinecraftJavaServer(server);
    const name = normalizePlayerName(rawName);
    return sendGameConsoleCommand(server, `whitelist ${action} ${name}`);
}

export async function runMinecraftPlayerBanCommand(
    server: GameServerWithContainer,
    rawName: unknown,
    rawReason?: unknown
): Promise<GameConsoleCommandResult> {
    assertOvhcloudMinecraftJavaServer(server);
    const name = normalizePlayerName(rawName);
    const reason = normalizeReason(rawReason);
    return sendGameConsoleCommand(server, reason ? `ban ${name} ${reason}` : `ban ${name}`);
}

export async function runMinecraftPlayerPardonCommand(
    server: GameServerWithContainer,
    rawName: unknown
): Promise<GameConsoleCommandResult> {
    assertOvhcloudMinecraftJavaServer(server);
    const name = normalizePlayerName(rawName);
    return sendGameConsoleCommand(server, `pardon ${name}`);
}

export async function runMinecraftIpBanCommand(
    server: GameServerWithContainer,
    rawTarget: unknown,
    rawReason?: unknown
): Promise<GameConsoleCommandResult> {
    assertOvhcloudMinecraftJavaServer(server);
    const target = normalizeBanIpTarget(rawTarget);
    const reason = normalizeReason(rawReason);
    return sendGameConsoleCommand(server, reason ? `ban-ip ${target} ${reason}` : `ban-ip ${target}`);
}

export async function runMinecraftIpPardonCommand(
    server: GameServerWithContainer,
    rawIp: unknown
): Promise<GameConsoleCommandResult> {
    assertOvhcloudMinecraftJavaServer(server);
    const ip = normalizeIp(rawIp);
    return sendGameConsoleCommand(server, `pardon-ip ${ip}`);
}
