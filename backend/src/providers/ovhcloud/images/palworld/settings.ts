import { promises as fs } from 'node:fs';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { resolveServerPath } from '../../../../services/fileExplorer.js';
import { ensureIsFile } from '../../../../utils/fsBrowser.js';
import { assertOvhcloudPalworldServer } from '../palworld.js';

type PalworldSettingType = 'boolean' | 'integer' | 'float' | 'select' | 'string';

type PalworldSettingDefinition = {
    key: string;
    label: string;
    description: string;
    type: PalworldSettingType;
    options?: string[];
    min?: number;
    max?: number;
};

type PalworldSettingValue = string | number | boolean;

export type PalworldSetting = PalworldSettingDefinition & {
    value: PalworldSettingValue;
};

const MAX_STRING_SETTING_LENGTH = 2048;
const PALWORLD_SETTINGS_FILE_PATH = '/server/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini';
const PALWORLD_DEFAULT_SETTINGS_FILE_PATH = '/server/DefaultPalWorldSettings.ini';

export const PALWORLD_SETTING_DEFINITIONS: PalworldSettingDefinition[] = [
    {
        key: 'ServerName',
        label: 'Server name',
        description: 'Name of the server shown in the community server list.',
        type: 'string',
    },
    {
        key: 'ServerDescription',
        label: 'Server description',
        description: 'Short description shown next to the server name.',
        type: 'string',
    },
    {
        key: 'ServerPassword',
        label: 'Server password',
        description: 'Password required to join. Leave empty to make the server public.',
        type: 'string',
    },
    {
        key: 'ServerPlayerMaxNum',
        label: 'Maximum players',
        description: 'Maximum number of players allowed on the server (dedicated servers are capped at 32).',
        type: 'integer',
        min: 1,
        max: 32,
    },
    {
        key: 'DeathPenalty',
        label: 'Death penalty',
        description: 'What a player loses when they die.',
        type: 'select',
        options: ['None', 'Item', 'ItemAndEquipment', 'All'],
    },
    {
        key: 'ExpRate',
        label: 'EXP rate',
        description: 'Experience gain multiplier for players and Pals.',
        type: 'float',
        min: 0.1,
        max: 20,
    },
    {
        key: 'PalCaptureRate',
        label: 'Pal capture rate',
        description: 'Capture rate multiplier for Pals.',
        type: 'float',
        min: 0.5,
        max: 2,
    },
    {
        key: 'CollectionDropRate',
        label: 'Gatherable drop rate',
        description: 'Multiplier for items gathered from nodes (trees, rocks, ...).',
        type: 'float',
        min: 0.5,
        max: 5,
    },
    {
        key: 'EnemyDropItemRate',
        label: 'Enemy drop rate',
        description: 'Multiplier for items dropped by defeated enemies.',
        type: 'float',
        min: 0.5,
        max: 5,
    },
    {
        key: 'WorkSpeedRate',
        label: 'Work speed rate',
        description: 'Multiplier for how fast Pals work at bases.',
        type: 'float',
        min: 0.1,
        max: 5,
    },
    {
        key: 'MonsterFarmActionSpeedRate',
        label: 'Ranch production speed rate',
        description: 'Multiplier for how fast Pals produce items at the Ranch.',
        type: 'float',
        min: 0.1,
        max: 5,
    },
    {
        key: 'bEnableFastTravel',
        label: 'Enable fast travel',
        description: 'Allow players to use fast travel points.',
        type: 'boolean',
    },
    {
        key: 'bIsStartLocationSelectByMap',
        label: 'Choose start location on map',
        description: 'Let players pick their starting location on the map.',
        type: 'boolean',
    },
    {
        key: 'PalEggDefaultHatchingTime',
        label: 'Egg hatching time (hours)',
        description: 'Time in hours needed to hatch a huge egg.',
        type: 'float',
        min: 0,
        max: 240,
    },
    {
        key: 'DropItemAliveMaxHours',
        label: 'Dropped item lifetime (hours)',
        description: 'How long dropped items stay in the world, in hours.',
        type: 'float',
        min: 0,
        max: 240,
    },
    {
        key: 'bEnableVoiceChat',
        label: 'Enable voice chat',
        description: 'Enable in-game proximity voice chat on the server.',
        type: 'boolean',
    },
    {
        key: 'VoiceChatMaxVolumeDistance',
        label: 'Voice full-volume distance',
        description: 'Distance within which voice chat plays at full volume (Unreal units; 100 = 1 m, so 3000 = ~30 m).',
        type: 'float',
    },
    {
        key: 'VoiceChatZeroVolumeDistance',
        label: 'Voice cutoff distance',
        description: 'Distance beyond which voice chat becomes inaudible (Unreal units; 100 = 1 m, so 15000 = ~150 m).',
        type: 'float',
    },
];

const SETTING_DEFINITIONS_BY_KEY = new Map(
    PALWORLD_SETTING_DEFINITIONS.map((definition) => [definition.key, definition])
);

function invalidInput(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 400 });
}

function splitTopLevel(inner: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inQuotes = false;
    let current = '';

    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
            current += ch;
        } else if (!inQuotes && ch === '(') {
            depth++;
            current += ch;
        } else if (!inQuotes && ch === ')') {
            depth--;
            current += ch;
        } else if (!inQuotes && depth === 0 && ch === ',') {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    parts.push(current);
    return parts;
}

function parsePairs(inner: string): { keys: string[]; values: Map<string, string> } {
    const keys: string[] = [];
    const values = new Map<string, string>();

    for (const segment of splitTopLevel(inner)) {
        const trimmed = segment.trim();
        if (!trimmed) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const rawValue = trimmed.slice(eq + 1);
        if (!key) continue;
        if (!values.has(key)) keys.push(key);
        values.set(key, rawValue);
    }

    return { keys, values };
}

function findOptionSettingsLine(content: string): { index: number; inner: string } | null {
    const lines = content.split('\n');
    const index = lines.findIndex((line) => line.trimStart().startsWith('OptionSettings='));
    if (index < 0) return null;

    const line = lines[index];
    const open = line.indexOf('(');
    const close = line.lastIndexOf(')');
    if (open < 0 || close < open) return { index, inner: '' };

    return { index, inner: line.slice(open + 1, close) };
}

async function readOptionSettingsValues(
    serverId: number,
    filePath: string,
    mustExist: boolean
): Promise<Map<string, string>> {
    let content: string;
    try {
        const resolved = await resolveServerPath({ serverId, root: 'data', path: filePath });
        if (mustExist) await ensureIsFile(resolved.absPath, resolved.rootDir);
        content = await fs.readFile(resolved.absPath, 'utf8');
    } catch (error) {
        if (mustExist) throw error;
        return new Map();
    }

    const found = findOptionSettingsLine(content);
    return found ? parsePairs(found.inner).values : new Map();
}

function unquote(rawValue: string): string {
    const trimmed = rawValue.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function convertSettingValue(definition: PalworldSettingDefinition, rawValue: string): PalworldSettingValue | null {
    switch (definition.type) {
        case 'boolean': {
            const normalized = rawValue.trim().toLowerCase();
            if (normalized === 'true') return true;
            if (normalized === 'false') return false;
            return null;
        }
        case 'integer': {
            const parsed = Number(rawValue.trim());
            return Number.isInteger(parsed) ? parsed : null;
        }
        case 'float': {
            const parsed = Number(rawValue.trim());
            return Number.isFinite(parsed) ? parsed : null;
        }
        case 'select':
        case 'string':
            return unquote(rawValue);
    }
}

function serializeSettingValue(definition: PalworldSettingDefinition, value: unknown): string {
    switch (definition.type) {
        case 'boolean': {
            if (typeof value !== 'boolean') invalidInput(`${definition.key} must be a boolean`);
            return value ? 'True' : 'False';
        }
        case 'integer':
        case 'float': {
            const numeric = typeof value === 'number'
                ? value
                : typeof value === 'string' && value.trim() !== ''
                    ? Number(value)
                    : Number.NaN;

            if (!Number.isFinite(numeric)) invalidInput(`${definition.key} must be a number`);
            if (definition.type === 'integer' && !Number.isInteger(numeric)) {
                invalidInput(`${definition.key} must be an integer`);
            }
            if (definition.min !== undefined && numeric < definition.min) {
                invalidInput(`${definition.key} must be greater than or equal to ${definition.min}`);
            }
            if (definition.max !== undefined && numeric > definition.max) {
                invalidInput(`${definition.key} must be less than or equal to ${definition.max}`);
            }

            return String(numeric);
        }
        case 'select': {
            if (typeof value !== 'string') invalidInput(`${definition.key} must be a string`);
            const normalized = value.trim();
            if (!definition.options?.includes(normalized)) {
                invalidInput(`${definition.key} must be one of: ${definition.options?.join(', ')}`);
            }
            return normalized;
        }
        case 'string': {
            if (typeof value !== 'string') invalidInput(`${definition.key} must be a string`);
            if (value.length > MAX_STRING_SETTING_LENGTH || /["(),\0\r\n]/.test(value)) {
                invalidInput(`${definition.key} contains invalid characters`);
            }
            return `"${value}"`;
        }
    }
}

export async function listPalworldSettings(server: GameServerRow): Promise<PalworldSetting[]> {
    assertOvhcloudPalworldServer(server);

    const active = await readOptionSettingsValues(server.id, PALWORLD_SETTINGS_FILE_PATH, true);
    const defaults = await readOptionSettingsValues(server.id, PALWORLD_DEFAULT_SETTINGS_FILE_PATH, false);

    return PALWORLD_SETTING_DEFINITIONS
        .map((definition) => {
            const rawValue = active.get(definition.key) ?? defaults.get(definition.key);
            if (rawValue === undefined) return null;
            const value = convertSettingValue(definition, rawValue);
            if (value === null) return null;
            return { ...definition, value };
        })
        .filter((setting): setting is PalworldSetting => Boolean(setting));
}

export async function patchPalworldSettings(
    server: GameServerRow,
    updates: Record<string, unknown>
): Promise<{ updated: string[]; settings: PalworldSetting[] }> {
    assertOvhcloudPalworldServer(server);

    const entries = Object.entries(updates);
    if (entries.length === 0) invalidInput('settings must contain at least one value');

    const resolved = await resolveServerPath({ serverId: server.id, root: 'data', path: PALWORLD_SETTINGS_FILE_PATH });
    await ensureIsFile(resolved.absPath, resolved.rootDir);
    const content = await fs.readFile(resolved.absPath, 'utf8');

    const found = findOptionSettingsLine(content);
    if (!found) {
        throw Object.assign(new Error('PalWorldSettings.ini has no OptionSettings entry'), { statusCode: 500 });
    }

    const { keys, values } = parsePairs(found.inner);
    const updated: string[] = [];

    for (const [key, value] of entries) {
        const definition = SETTING_DEFINITIONS_BY_KEY.get(key);
        if (!definition) invalidInput(`Unsupported Palworld setting: ${key}`);

        const rawValue = serializeSettingValue(definition, value);
        if (!values.has(key)) keys.push(key);
        values.set(key, rawValue);
        updated.push(key);
    }

    const newInner = keys.map((key) => `${key}=${values.get(key)}`).join(',');
    const lines = content.split('\n');
    lines[found.index] = `OptionSettings=(${newInner})`;
    await fs.writeFile(resolved.absPath, lines.join('\n'), 'utf8');

    return {
        updated,
        settings: await listPalworldSettings(server),
    };
}
