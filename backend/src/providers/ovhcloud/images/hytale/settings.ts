import { promises as fs } from 'node:fs';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { resolveServerPath } from '../../../../services/fileExplorer.js';
import { ensureIsFile } from '../../../../utils/fsBrowser.js';
import { assertOvhcloudHytaleServer } from '../hytale.js';

type HytaleSettingType = 'integer' | 'string';

type HytaleSettingDefinition = {
    key: string;
    label: string;
    description: string;
    type: HytaleSettingType;
    min?: number;
    max?: number;
};

type HytaleSettingValue = string | number;

export type HytaleSetting = HytaleSettingDefinition & {
    value: HytaleSettingValue;
};

const MAX_STRING_SETTING_LENGTH = 2048;
const HYTALE_SETTINGS_FILE_PATH = '/game/Server/config.json';

export const HYTALE_SETTING_DEFINITIONS: HytaleSettingDefinition[] = [
    {
        key: 'ServerName',
        label: 'Server name',
        description: 'Name of the server displayed to players in the Hytale server list.',
        type: 'string',
    },
    {
        key: 'MOTD',
        label: 'Server MOTD',
        description: 'Message of the day displayed to players when connecting to the server.',
        type: 'string',
    },
    {
        key: 'Password',
        label: 'Server password',
        description: 'Password required to join the server. Leave empty to make the server public.',
        type: 'string',
    },
    {
        key: 'MaxPlayers',
        label: 'Maximum players',
        description: 'Maximum number of players that can connect to the server at the same time.',
        type: 'integer',
        min: 1,
        max: 1000,
    },
    {
        key: 'MaxViewRadius',
        label: 'Maximum view radius',
        description: 'Maximum view distance sent to players, in chunks. Lower values improve performance and reduce memory usage.',
        type: 'integer',
        min: 1,
        max: 64,
    },
];

const SETTING_DEFINITIONS_BY_KEY = new Map(
    HYTALE_SETTING_DEFINITIONS.map((definition) => [definition.key, definition])
);

function invalidInput(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 400 });
}

async function resolveHytaleSettingsFile(serverId: number): Promise<{ absPath: string; rootDir: string }> {
    const resolved = await resolveServerPath({ serverId, root: 'data', path: HYTALE_SETTINGS_FILE_PATH });
    await ensureIsFile(resolved.absPath, resolved.rootDir);
    return {
        absPath: resolved.absPath,
        rootDir: resolved.rootDir,
    };
}

async function readHytaleSettingsFile(serverId: number): Promise<{ filePath: string; settingsDocument: Record<string, unknown> }> {
    const resolved = await resolveHytaleSettingsFile(serverId);
    const raw = await fs.readFile(resolved.absPath, 'utf8');

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw Object.assign(new Error('Hytale settings file contains invalid JSON'), { statusCode: 500 });
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw Object.assign(new Error('Hytale settings file must contain a JSON object'), { statusCode: 500 });
    }

    return {
        filePath: resolved.absPath,
        settingsDocument: parsed as Record<string, unknown>,
    };
}

function convertSettingValue(definition: HytaleSettingDefinition, rawValue: unknown): HytaleSettingValue | null {
    if (definition.type === 'integer') {
        return typeof rawValue === 'number' && Number.isInteger(rawValue) ? rawValue : null;
    }

    return typeof rawValue === 'string' ? rawValue : null;
}

function serializeSettingValue(definition: HytaleSettingDefinition, value: unknown): HytaleSettingValue {
    if (definition.type === 'integer') {
        const integer = typeof value === 'number'
            ? value
            : typeof value === 'string' && value.trim() !== ''
                ? Number(value)
                : Number.NaN;

        if (!Number.isInteger(integer)) invalidInput(`${definition.key} must be an integer`);
        if (definition.min !== undefined && integer < definition.min) {
            invalidInput(`${definition.key} must be greater than or equal to ${definition.min}`);
        }
        if (definition.max !== undefined && integer > definition.max) {
            invalidInput(`${definition.key} must be less than or equal to ${definition.max}`);
        }

        return integer;
    }

    if (typeof value !== 'string') invalidInput(`${definition.key} must be a string`);
    if (value.length > MAX_STRING_SETTING_LENGTH || /[\0\r\n]/.test(value)) {
        invalidInput(`${definition.key} is invalid`);
    }

    return value;
}

export async function listHytaleSettings(server: GameServerRow): Promise<HytaleSetting[]> {
    assertOvhcloudHytaleServer(server);

    const { settingsDocument } = await readHytaleSettingsFile(server.id);

    return HYTALE_SETTING_DEFINITIONS
        .filter((definition) => Object.prototype.hasOwnProperty.call(settingsDocument, definition.key))
        .map((definition) => {
            const value = convertSettingValue(definition, settingsDocument[definition.key]);
            if (value === null) return null;
            return { ...definition, value };
        })
        .filter((setting): setting is HytaleSetting => Boolean(setting));
}

export async function patchHytaleSettings(
    server: GameServerRow,
    updates: Record<string, unknown>
): Promise<{ updated: string[]; settings: HytaleSetting[] }> {
    assertOvhcloudHytaleServer(server);

    const entries = Object.entries(updates);
    if (entries.length === 0) invalidInput('settings must contain at least one value');

    const { filePath, settingsDocument } = await readHytaleSettingsFile(server.id);
    const updated: string[] = [];

    for (const [key, value] of entries) {
        const definition = SETTING_DEFINITIONS_BY_KEY.get(key);
        if (!definition) invalidInput(`Unsupported Hytale setting: ${key}`);

        if (!Object.prototype.hasOwnProperty.call(settingsDocument, key)) {
            throw Object.assign(new Error(`Hytale setting is not present in config.json: ${key}`), { statusCode: 404 });
        }

        settingsDocument[key] = serializeSettingValue(definition, value);
        updated.push(key);
    }

    await fs.writeFile(filePath, `${JSON.stringify(settingsDocument, null, 2)}\n`, 'utf8');

    return {
        updated,
        settings: await listHytaleSettings(server),
    };
}
