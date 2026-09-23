import { promises as fs } from 'node:fs';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { ensureIsFile } from '../../../../utils/fsBrowser.js';
import { getOvhcloudMinecraftMetadata } from '../../../serverMetadata.js';
import type {
    FileSettingsAccessor,
    SettingDefinition,
    SettingValue,
} from '../../settings/types.js';
import { assertOvhcloudMinecraftJavaServer, resolveDataFile } from './shared.js';


type ParsedPropertyLine =
    | { type: 'property'; raw: string; key: string; value: string }
    | { type: 'other'; raw: string };

type ParsedPropertiesFile = {
    lines: ParsedPropertyLine[];
    newline: string;
    finalNewline: boolean;
};

const MAX_STRING_PROPERTY_LENGTH = 2048;

const MINECRAFT_JAVA_SETTING_DEFINITIONS: SettingDefinition[] = [
    {
        key: 'motd',
        group: 'branding',
        label: 'Server MOTD',
        description: 'Text displayed in the Minecraft multiplayer server list.',
        type: 'string',
        maxLength: MAX_STRING_PROPERTY_LENGTH,
    },
    {
        key: 'max-players',
        group: 'players',
        label: 'Maximum players',
        description: 'Maximum number of players that can connect to the server at the same time.',
        type: 'integer',
        min: 1,
        max: 500,
    },
    {
        key: 'online-mode',
        group: 'security',
        label: 'Account verification',
        description: 'Checks that players use an official Microsoft/Mojang Minecraft account.',
        type: 'boolean',
    },
    {
        key: 'difficulty',
        group: 'gameplay',
        label: 'Difficulty',
        description: 'Sets the global world difficulty.',
        type: 'select',
        options: [
            { value: 'peaceful', label: 'peaceful' },
            { value: 'easy', label: 'easy' },
            { value: 'normal', label: 'normal' },
            { value: 'hard', label: 'hard' },
        ],
    },
    {
        key: 'gamemode',
        group: 'gameplay',
        label: 'Game mode',
        description: 'Sets the default game mode for new players.',
        type: 'select',
        options: [
            { value: 'survival', label: 'survival' },
            { value: 'creative', label: 'creative' },
            { value: 'adventure', label: 'adventure' },
            { value: 'spectator', label: 'spectator' },
        ],
    },
    {
        key: 'hardcore',
        group: 'gameplay',
        label: 'Hardcore mode',
        description: 'Enables Hardcore mode with maximum difficulty and permanent death.',
        type: 'boolean',
    },
    {
        key: 'pvp',
        group: 'gameplay',
        label: 'PvP',
        description: 'Allows players to fight each other.',
        type: 'boolean',
    },
    {
        key: 'allow-flight',
        group: 'gameplay',
        label: 'Allow flight',
        description: 'Allows players to fly without being automatically kicked by the server.',
        type: 'boolean',
    },
    {
        key: 'spawn-monsters',
        group: 'world',
        label: 'Hostile monsters',
        description: 'Allows hostile monsters to spawn in the world.',
        type: 'boolean',
    },
    {
        key: 'allow-nether',
        group: 'world',
        label: 'Nether',
        description: 'Allows access to and generation of the Nether.',
        type: 'boolean',
    },
    {
        key: 'generate-structures',
        group: 'world',
        label: 'Structures',
        description: 'Generates villages, temples, dungeons, and other natural structures.',
        type: 'boolean',
    },
    {
        key: 'level-seed',
        group: 'world',
        label: 'World seed',
        description: 'Seed used to generate the Minecraft world.',
        type: 'string',
        maxLength: MAX_STRING_PROPERTY_LENGTH,
    },
    {
        key: 'level-name',
        group: 'world',
        label: 'World name',
        description: 'Name of the world folder loaded by the server.',
        type: 'string',
        maxLength: MAX_STRING_PROPERTY_LENGTH,
    },
    {
        key: 'view-distance',
        group: 'performance',
        label: 'View distance',
        description: 'Maximum chunk view distance visible to players.',
        type: 'integer',
        min: 3,
        max: 32,
    },
    {
        key: 'simulation-distance',
        group: 'performance',
        label: 'Simulation distance',
        description: 'Maximum chunk simulation distance for entities and redstone.',
        type: 'integer',
        min: 3,
        max: 32,
    },
    {
        key: 'hide-online-players',
        group: 'branding',
        label: 'Hide online players',
        description: 'Hides the connected player list in the multiplayer server list.',
        type: 'boolean',
    },
    {
        key: 'enable-query',
        group: 'network',
        label: 'GS4 query protocol',
        description:
            'Opens the query listener used by server trackers. The panel also uses it to list '
            + 'every connected player.',
        type: 'boolean',
    },
    {
        key: 'require-resource-pack',
        group: 'branding',
        label: 'Require resource pack',
        description: 'Requires players to accept the resource pack before joining the server.',
        type: 'boolean',
    },
    {
        key: 'resource-pack',
        group: 'branding',
        label: 'Resource pack URL',
        description: 'Direct URL of the resource pack downloaded by players.',
        type: 'string',
        maxLength: MAX_STRING_PROPERTY_LENGTH,
    },
    {
        key: 'resource-pack-prompt',
        group: 'branding',
        label: 'Resource pack prompt',
        description: 'Message displayed when players are asked to download the resource pack.',
        type: 'string',
        maxLength: MAX_STRING_PROPERTY_LENGTH,
    },
    {
        key: 'enable-command-block',
        group: 'gameplay',
        label: 'Command blocks',
        description: 'Allows command blocks to be used on the server.',
        type: 'boolean',
    },
    {
        key: 'spawn-protection',
        group: 'world',
        label: 'Spawn protection',
        description: 'Protection radius around the world spawn point.',
        type: 'integer',
        min: 0,
        max: 64,
    },
    {
        key: 'player-idle-timeout',
        group: 'players',
        label: 'AFK kick timeout',
        description: 'Minutes before inactive players are automatically kicked. 0 disables this feature.',
        type: 'integer',
        min: 0,
        max: 1440,
    },
];

const MINECRAFT_BEDROCK_SETTING_DEFINITIONS: SettingDefinition[] = [
    {
        key: 'server-name',
        group: 'branding',
        label: 'Server name',
        description: 'Name displayed for the Bedrock dedicated server.',
        type: 'string',
        maxLength: MAX_STRING_PROPERTY_LENGTH,
    },
    {
        key: 'max-players',
        group: 'players',
        label: 'Maximum players',
        description: 'Maximum number of players that can play on the server at the same time.',
        type: 'integer',
        min: 1,
        max: 100,
    },
    {
        key: 'gamemode',
        group: 'gameplay',
        label: 'Game mode',
        description: 'Sets the game mode for new players.',
        type: 'select',
        options: [
            { value: 'survival', label: 'survival' },
            { value: 'creative', label: 'creative' },
            { value: 'adventure', label: 'adventure' },
        ],
    },
    {
        key: 'difficulty',
        group: 'gameplay',
        label: 'Difficulty',
        description: 'Sets the difficulty of the world.',
        type: 'select',
        options: [
            { value: 'peaceful', label: 'peaceful' },
            { value: 'easy', label: 'easy' },
            { value: 'normal', label: 'normal' },
            { value: 'hard', label: 'hard' },
        ],
    },
    {
        key: 'allow-cheats',
        group: 'gameplay',
        label: 'Allow cheats',
        description: 'Allows cheat commands to be used on the server.',
        type: 'boolean',
    },
    {
        key: 'online-mode',
        group: 'security',
        label: 'Account verification',
        description: 'Requires connected players to be authenticated with Xbox Live.',
        type: 'boolean',
    },
    {
        key: 'level-name',
        group: 'world',
        label: 'World name',
        description: 'Name of the world folder used or generated by the server.',
        type: 'string',
        maxLength: MAX_STRING_PROPERTY_LENGTH,
    },
    {
        key: 'level-seed',
        group: 'world',
        label: 'World seed',
        description: 'Seed used to generate the Bedrock world. Leave empty to generate a random seed.',
        type: 'string',
        maxLength: MAX_STRING_PROPERTY_LENGTH,
    },
    {
        key: 'view-distance',
        group: 'performance',
        label: 'View distance',
        description: 'Maximum chunk view distance sent to players.',
        type: 'integer',
        min: 5,
        max: 96,
    },
    {
        key: 'tick-distance',
        group: 'performance',
        label: 'Simulation distance',
        description: 'Number of chunks around each player where the world is actively ticked.',
        type: 'integer',
        min: 4,
        max: 12,
    },
    {
        key: 'player-idle-timeout',
        group: 'players',
        label: 'AFK kick timeout',
        description: 'Minutes before inactive players are automatically kicked. 0 disables this feature.',
        type: 'integer',
        min: 0,
        max: 1440,
    },
    {
        key: 'texturepack-required',
        group: 'branding',
        label: 'Require texture pack',
        description: 'Requires players to use the texture packs configured for the world.',
        type: 'boolean',
    },
    {
        key: 'default-player-permission-level',
        group: 'security',
        label: 'Default player permission',
        description: 'Permission level assigned to new players when they join for the first time.',
        type: 'select',
        options: [
            { value: 'visitor', label: 'visitor' },
            { value: 'member', label: 'member' },
            { value: 'operator', label: 'operator' },
        ],
    },
    {
        key: 'force-gamemode',
        group: 'gameplay',
        label: 'Force game mode',
        description: 'Forces players to use the game mode configured in the server properties.',
        type: 'boolean',
    },
    {
        key: 'disable-custom-skins',
        group: 'security',
        label: 'Disable custom skins',
        description: 'Disables custom skins that were created outside the Minecraft Store or in-game assets.',
        type: 'boolean',
    },
];

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

function parsePropertyValue(definition: SettingDefinition, rawValue: string): SettingValue {
    if (definition.type === 'boolean') return rawValue.trim().toLowerCase() === 'true';

    if (definition.type === 'integer') {
        const parsed = Number.parseInt(rawValue.trim(), 10);
        return Number.isInteger(parsed) ? parsed : rawValue;
    }

    return rawValue;
}

function renderPropertyValue(definition: SettingDefinition, value: SettingValue): string {
    if (definition.type === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

function getPropertyLine(
    parsed: ParsedPropertiesFile,
    key: string
): Extract<ParsedPropertyLine, { type: 'property' }> | null {
    const line = parsed.lines.find((entry) => entry.type === 'property' && entry.key === key);
    return line?.type === 'property' ? line : null;
}

type MinecraftPropertiesSnapshot = { filePath: string; parsed: ParsedPropertiesFile };

async function readServerPropertiesFile(serverId: number): Promise<MinecraftPropertiesSnapshot> {
    const resolved = await resolveDataFile(serverId, '/server.properties');
    await ensureIsFile(resolved.absPath, resolved.rootDir);
    const content = await fs.readFile(resolved.absPath, 'utf8');
    return { filePath: resolved.absPath, parsed: parsePropertiesContent(content) };
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

const MINECRAFT_FILE_SETTINGS: FileSettingsAccessor<MinecraftPropertiesSnapshot> = {
    onMissing: 'omit',

    definitions(server: GameServerRow): SettingDefinition[] {
        return getOvhcloudMinecraftMetadata(server).edition === 'bedrock'
            ? MINECRAFT_BEDROCK_SETTING_DEFINITIONS
            : MINECRAFT_JAVA_SETTING_DEFINITIONS;
    },

    async load(server: GameServerRow): Promise<MinecraftPropertiesSnapshot> {
        getOvhcloudMinecraftMetadata(server);
        return readServerPropertiesFile(server.id);
    },

    read(snapshot: MinecraftPropertiesSnapshot, definition: SettingDefinition): SettingValue | null {
        const line = getPropertyLine(snapshot.parsed, definition.key);
        return line === null ? null : parsePropertyValue(definition, line.value);
    },

    write(snapshot: MinecraftPropertiesSnapshot, definition: SettingDefinition, value: SettingValue): boolean {
        const line = getPropertyLine(snapshot.parsed, definition.key);
        if (!line) return false;

        line.value = renderPropertyValue(definition, value);
        line.raw = `${definition.key}=${escapeJavaPropertyValue(line.value)}`;
        return true;
    },

    async save(_server: GameServerRow, snapshot: MinecraftPropertiesSnapshot): Promise<void> {
        await fs.writeFile(snapshot.filePath, serializePropertiesFile(snapshot.parsed), 'utf8');
    },
};

export async function readMinecraftJavaPropertiesMap(server: GameServerRow): Promise<Map<string, string>> {
    assertOvhcloudMinecraftJavaServer(server);
    return readMinecraftPropertiesMap(server);
}

export async function readMinecraftLevelName(server: GameServerRow): Promise<string> {
    try {
        const values = await readMinecraftPropertiesMap(server);
        const name = (values.get('level-name') ?? '').trim();
        return name || 'world';
    } catch {
        return 'world';
    }
}

export function minecraftFileSettingsAccessor(): FileSettingsAccessor<MinecraftPropertiesSnapshot> {
    return MINECRAFT_FILE_SETTINGS;
}
