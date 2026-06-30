import { promises as fs } from 'node:fs';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { ensureIsFile } from '../../../../utils/fsBrowser.js';
import { getOvhcloudMinecraftMetadata } from '../../../serverMetadata.js';
import {
    assertOvhcloudMinecraftBedrockServer,
    assertOvhcloudMinecraftJavaServer,
    invalidInput,
    resolveDataFile,
} from './shared.js';

type MinecraftSettingType = 'boolean' | 'integer' | 'select' | 'string';

type MinecraftSettingDefinition = {
    key: string;
    label: string;
    description: string;
    type: MinecraftSettingType;
    options?: string[];
    min?: number;
    max?: number;
};

type MinecraftSettingValue = string | number | boolean;

export type MinecraftSetting = MinecraftSettingDefinition & {
    value: MinecraftSettingValue;
};

type ParsedPropertyLine =
    | { type: 'property'; raw: string; key: string; value: string }
    | { type: 'other'; raw: string };

type ParsedPropertiesFile = {
    lines: ParsedPropertyLine[];
    newline: string;
    finalNewline: boolean;
};

const MAX_STRING_PROPERTY_LENGTH = 2048;

export const MINECRAFT_JAVA_SETTING_DEFINITIONS: MinecraftSettingDefinition[] = [
    {
        key: 'motd',
        label: 'Server MOTD',
        description: 'Text displayed in the Minecraft multiplayer server list.',
        type: 'string',
    },
    {
        key: 'max-players',
        label: 'Maximum players',
        description: 'Maximum number of players that can connect to the server at the same time.',
        type: 'integer',
        min: 1,
        max: 500,
    },
    {
        key: 'online-mode',
        label: 'Account verification',
        description: 'Checks that players use an official Microsoft/Mojang Minecraft account.',
        type: 'boolean',
    },
    {
        key: 'difficulty',
        label: 'Difficulty',
        description: 'Sets the global world difficulty.',
        type: 'select',
        options: ['peaceful', 'easy', 'normal', 'hard'],
    },
    {
        key: 'gamemode',
        label: 'Game mode',
        description: 'Sets the default game mode for new players.',
        type: 'select',
        options: ['survival', 'creative', 'adventure', 'spectator'],
    },
    {
        key: 'hardcore',
        label: 'Hardcore mode',
        description: 'Enables Hardcore mode with maximum difficulty and permanent death.',
        type: 'boolean',
    },
    {
        key: 'pvp',
        label: 'PvP',
        description: 'Allows players to fight each other.',
        type: 'boolean',
    },
    {
        key: 'allow-flight',
        label: 'Allow flight',
        description: 'Allows players to fly without being automatically kicked by the server.',
        type: 'boolean',
    },
    {
        key: 'spawn-monsters',
        label: 'Hostile monsters',
        description: 'Allows hostile monsters to spawn in the world.',
        type: 'boolean',
    },
    {
        key: 'allow-nether',
        label: 'Nether',
        description: 'Allows access to and generation of the Nether.',
        type: 'boolean',
    },
    {
        key: 'generate-structures',
        label: 'Structures',
        description: 'Generates villages, temples, dungeons, and other natural structures.',
        type: 'boolean',
    },
    {
        key: 'level-seed',
        label: 'World seed',
        description: 'Seed used to generate the Minecraft world.',
        type: 'string',
    },
    {
        key: 'level-name',
        label: 'World name',
        description: 'Name of the world folder loaded by the server.',
        type: 'string',
    },
    {
        key: 'view-distance',
        label: 'View distance',
        description: 'Maximum chunk view distance visible to players.',
        type: 'integer',
        min: 2,
        max: 32,
    },
    {
        key: 'simulation-distance',
        label: 'Simulation distance',
        description: 'Maximum chunk simulation distance for entities and redstone.',
        type: 'integer',
        min: 2,
        max: 32,
    },
    {
        key: 'hide-online-players',
        label: 'Hide online players',
        description: 'Hides the connected player list in the multiplayer server list.',
        type: 'boolean',
    },
    {
        key: 'require-resource-pack',
        label: 'Require resource pack',
        description: 'Requires players to accept the resource pack before joining the server.',
        type: 'boolean',
    },
    {
        key: 'resource-pack',
        label: 'Resource pack URL',
        description: 'Direct URL of the resource pack downloaded by players.',
        type: 'string',
    },
    {
        key: 'resource-pack-prompt',
        label: 'Resource pack prompt',
        description: 'Message displayed when players are asked to download the resource pack.',
        type: 'string',
    },
    {
        key: 'enable-command-block',
        label: 'Command blocks',
        description: 'Allows command blocks to be used on the server.',
        type: 'boolean',
    },
    {
        key: 'spawn-protection',
        label: 'Spawn protection',
        description: 'Protection radius around the world spawn point.',
        type: 'integer',
        min: 0,
        max: 64,
    },
    {
        key: 'player-idle-timeout',
        label: 'AFK kick timeout',
        description: 'Minutes before inactive players are automatically kicked. 0 disables this feature.',
        type: 'integer',
        min: 0,
        max: 1440,
    },
];

const SETTING_DEFINITIONS_BY_KEY = new Map(
    MINECRAFT_JAVA_SETTING_DEFINITIONS.map((definition) => [definition.key, definition])
);

export const MINECRAFT_BEDROCK_SETTING_DEFINITIONS: MinecraftSettingDefinition[] = [
    {
        key: 'server-name',
        label: 'Server name',
        description: 'Name displayed for the Bedrock dedicated server.',
        type: 'string',
    },
    {
        key: 'max-players',
        label: 'Maximum players',
        description: 'Maximum number of players that can play on the server at the same time.',
        type: 'integer',
        min: 1,
        max: 100,
    },
    {
        key: 'gamemode',
        label: 'Game mode',
        description: 'Sets the game mode for new players.',
        type: 'select',
        options: ['survival', 'creative', 'adventure'],
    },
    {
        key: 'difficulty',
        label: 'Difficulty',
        description: 'Sets the difficulty of the world.',
        type: 'select',
        options: ['peaceful', 'easy', 'normal', 'hard'],
    },
    {
        key: 'allow-cheats',
        label: 'Allow cheats',
        description: 'Allows cheat commands to be used on the server.',
        type: 'boolean',
    },
    {
        key: 'online-mode',
        label: 'Account verification',
        description: 'Requires connected players to be authenticated with Xbox Live.',
        type: 'boolean',
    },
    {
        key: 'level-name',
        label: 'World name',
        description: 'Name of the world folder used or generated by the server.',
        type: 'string',
    },
    {
        key: 'level-seed',
        label: 'World seed',
        description: 'Seed used to generate the Bedrock world. Leave empty to generate a random seed.',
        type: 'string',
    },
    {
        key: 'view-distance',
        label: 'View distance',
        description: 'Maximum chunk view distance sent to players.',
        type: 'integer',
        min: 5,
        max: 96,
    },
    {
        key: 'tick-distance',
        label: 'Simulation distance',
        description: 'Number of chunks around each player where the world is actively ticked.',
        type: 'integer',
        min: 4,
        max: 12,
    },
    {
        key: 'player-idle-timeout',
        label: 'AFK kick timeout',
        description: 'Minutes before inactive players are automatically kicked. 0 disables this feature.',
        type: 'integer',
        min: 0,
        max: 1440,
    },
    {
        key: 'texturepack-required',
        label: 'Require texture pack',
        description: 'Requires players to use the texture packs configured for the world.',
        type: 'boolean',
    },
    {
        key: 'default-player-permission-level',
        label: 'Default player permission',
        description: 'Permission level assigned to new players when they join for the first time.',
        type: 'select',
        options: ['visitor', 'member', 'operator'],
    },
    {
        key: 'force-gamemode',
        label: 'Force game mode',
        description: 'Forces players to use the game mode configured in the server properties.',
        type: 'boolean',
    },
    {
        key: 'disable-custom-skins',
        label: 'Disable custom skins',
        description: 'Disables custom skins that were created outside the Minecraft Store or in-game assets.',
        type: 'boolean',
    },
];

const BEDROCK_SETTING_DEFINITIONS_BY_KEY = new Map(
    MINECRAFT_BEDROCK_SETTING_DEFINITIONS.map((definition) => [definition.key, definition])
);

function splitPropertiesContent(content: string): { lines: string[]; newline: string; finalNewline: boolean } {
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const finalNewline = /\r?\n$/.test(content);
    const lines = content.split(/\r?\n/);
    if (finalNewline) lines.pop();
    return { lines, newline, finalNewline };
}

function isEscaped(input: string, index: number): boolean {
    let backslashes = 0;
    for (let i = index - 1; i >= 0 && input[i] === '\\'; i -= 1) {
        backslashes += 1;
    }
    return backslashes % 2 === 1;
}

function findPropertySeparator(line: string): number {
    for (let i = 0; i < line.length; i += 1) {
        if (line[i] === '=' && !isEscaped(line, i)) return i;
    }
    return -1;
}

function unescapeJavaProperty(input: string): string {
    let output = '';

    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (char !== '\\' || i === input.length - 1) {
            output += char;
            continue;
        }

        const next = input[++i];
        if (next === 't') output += '\t';
        else if (next === 'n') output += '\n';
        else if (next === 'r') output += '\r';
        else if (next === 'f') output += '\f';
        else if (next === 'u' && i + 4 < input.length) {
            const hex = input.slice(i + 1, i + 5);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                output += String.fromCharCode(Number.parseInt(hex, 16));
                i += 4;
            } else {
                output += next;
            }
        } else {
            output += next;
        }
    }

    return output;
}

function escapeJavaPropertyValue(input: string): string {
    let output = '';

    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (char === '\\') output += '\\\\';
        else if (char === '\t') output += '\\t';
        else if (char === '\n') output += '\\n';
        else if (char === '\r') output += '\\r';
        else if (char === '\f') output += '\\f';
        else if (char === ':' || char === '=') output += `\\${char}`;
        else output += char;
    }

    if (output.startsWith(' ') || output.startsWith('#') || output.startsWith('!')) {
        output = `\\${output}`;
    }

    return output;
}

function parsePropertiesContent(content: string): ParsedPropertiesFile {
    const { lines, newline, finalNewline } = splitPropertiesContent(content);

    return {
        newline,
        finalNewline,
        lines: lines.map((line) => {
            const trimmed = line.trimStart();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
                return { type: 'other', raw: line };
            }

            const separator = findPropertySeparator(line);
            if (separator <= 0) {
                return { type: 'other', raw: line };
            }

            return {
                type: 'property',
                raw: line,
                key: unescapeJavaProperty(line.slice(0, separator).trim()),
                value: unescapeJavaProperty(line.slice(separator + 1)),
            };
        }),
    };
}

function serializePropertiesFile(parsed: ParsedPropertiesFile): string {
    const content = parsed.lines.map((line) => line.raw).join(parsed.newline);
    return parsed.finalNewline ? `${content}${parsed.newline}` : content;
}

function convertSettingValue(definition: MinecraftSettingDefinition, rawValue: string): MinecraftSettingValue {
    if (definition.type === 'boolean') return rawValue.trim().toLowerCase() === 'true';

    if (definition.type === 'integer') {
        const parsed = Number.parseInt(rawValue.trim(), 10);
        return Number.isInteger(parsed) ? parsed : rawValue;
    }

    return rawValue;
}

function serializeSettingValue(definition: MinecraftSettingDefinition, value: unknown): string {
    if (definition.type === 'boolean') {
        if (typeof value !== 'boolean') invalidInput(`${definition.key} must be a boolean`);
        return value ? 'true' : 'false';
    }

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

        return String(integer);
    }

    if (definition.type === 'select') {
        if (typeof value !== 'string') invalidInput(`${definition.key} must be a string`);
        const normalized = value.trim();
        if (!definition.options?.includes(normalized)) {
            invalidInput(`${definition.key} must be one of: ${definition.options?.join(', ')}`);
        }
        return normalized;
    }

    if (typeof value !== 'string') invalidInput(`${definition.key} must be a string`);
    if (value.length > MAX_STRING_PROPERTY_LENGTH || /[\0\r\n]/.test(value)) {
        invalidInput(`${definition.key} is invalid`);
    }
    return value;
}

async function readServerPropertiesFile(serverId: number): Promise<{ path: string; parsed: ParsedPropertiesFile }> {
    const resolved = await resolveDataFile(serverId, '/server.properties');
    await ensureIsFile(resolved.absPath, resolved.rootDir);
    const content = await fs.readFile(resolved.absPath, 'utf8');
    return { path: resolved.absPath, parsed: parsePropertiesContent(content) };
}

function getPropertyLine(parsed: ParsedPropertiesFile, key: string): Extract<ParsedPropertyLine, { type: 'property' }> | null {
    const line = parsed.lines.find((entry) => entry.type === 'property' && entry.key === key);
    return line?.type === 'property' ? line : null;
}

function propertiesToMap(parsed: ParsedPropertiesFile): Map<string, string> {
    const map = new Map<string, string>();

    for (const line of parsed.lines) {
        if (line.type === 'property') map.set(line.key, line.value);
    }

    return map;
}

async function readMinecraftPropertiesMap(server: GameServerRow): Promise<Map<string, string>> {
    const { parsed } = await readServerPropertiesFile(server.id);
    return propertiesToMap(parsed);
}

async function listMinecraftSettingsFromDefinitions(
    server: GameServerRow,
    definitions: MinecraftSettingDefinition[]
): Promise<MinecraftSetting[]> {
    const values = await readMinecraftPropertiesMap(server);
    return definitions
        .filter((definition) => values.has(definition.key))
        .map((definition) => ({
            ...definition,
            value: convertSettingValue(definition, values.get(definition.key) ?? ''),
        }));
}

async function patchMinecraftSettingsFromDefinitions(
    server: GameServerRow,
    definitionsByKey: Map<string, MinecraftSettingDefinition>,
    updates: Record<string, unknown>
): Promise<{ updated: string[]; settings: MinecraftSetting[] }> {
    const entries = Object.entries(updates);
    if (entries.length === 0) invalidInput('settings must contain at least one value');

    const { path: filePath, parsed } = await readServerPropertiesFile(server.id);
    const updated: string[] = [];

    for (const [key, value] of entries) {
        const definition = definitionsByKey.get(key);
        if (!definition) invalidInput(`Unsupported Minecraft setting: ${key}`);

        const line = getPropertyLine(parsed, key);
        if (!line) {
            throw Object.assign(new Error(`Minecraft setting is not present in server.properties: ${key}`), { statusCode: 404 });
        }

        line.value = serializeSettingValue(definition, value);
        line.raw = `${key}=${escapeJavaPropertyValue(line.value)}`;
        updated.push(key);
    }

    await fs.writeFile(filePath, serializePropertiesFile(parsed), 'utf8');

    return {
        updated,
        settings: await listMinecraftSettings(server),
    };
}

export async function readMinecraftJavaPropertiesMap(server: GameServerRow): Promise<Map<string, string>> {
    assertOvhcloudMinecraftJavaServer(server);
    return readMinecraftPropertiesMap(server);
}

export async function listMinecraftJavaSettings(server: GameServerRow): Promise<MinecraftSetting[]> {
    assertOvhcloudMinecraftJavaServer(server);
    return listMinecraftSettingsFromDefinitions(server, MINECRAFT_JAVA_SETTING_DEFINITIONS);
}

export async function patchMinecraftJavaSettings(
    server: GameServerRow,
    updates: Record<string, unknown>
): Promise<{ updated: string[]; settings: MinecraftSetting[] }> {
    assertOvhcloudMinecraftJavaServer(server);
    return patchMinecraftSettingsFromDefinitions(server, SETTING_DEFINITIONS_BY_KEY, updates);
}

export async function listMinecraftBedrockSettings(server: GameServerRow): Promise<MinecraftSetting[]> {
    assertOvhcloudMinecraftBedrockServer(server);
    return listMinecraftSettingsFromDefinitions(server, MINECRAFT_BEDROCK_SETTING_DEFINITIONS);
}

export async function patchMinecraftBedrockSettings(
    server: GameServerRow,
    updates: Record<string, unknown>
): Promise<{ updated: string[]; settings: MinecraftSetting[] }> {
    assertOvhcloudMinecraftBedrockServer(server);
    return patchMinecraftSettingsFromDefinitions(server, BEDROCK_SETTING_DEFINITIONS_BY_KEY, updates);
}

export async function listMinecraftSettings(server: GameServerRow): Promise<MinecraftSetting[]> {
    const metadata = getOvhcloudMinecraftMetadata(server);
    if (metadata.edition === 'bedrock') return listMinecraftBedrockSettings(server);
    return listMinecraftJavaSettings(server);
}

export async function patchMinecraftSettings(
    server: GameServerRow,
    updates: Record<string, unknown>
): Promise<{ updated: string[]; settings: MinecraftSetting[] }> {
    const metadata = getOvhcloudMinecraftMetadata(server);
    if (metadata.edition === 'bedrock') return patchMinecraftBedrockSettings(server, updates);
    return patchMinecraftJavaSettings(server, updates);
}
