import type { GameServerRow } from '../../../../types/gameServer.js';
import {
    getPooledParam,
    hasPooledFlag,
    parsePooledParams,
    serializePooledParams,
    setPooledFlag,
    setPooledParam,
} from '../../settings/pooledParams.js';
import type {
    EnvMap,
    LaunchSettingsAccessor,
    SettingDefinition,
    SettingOption,
    SettingValue,
} from '../../settings/types.js';
import {
    LAUNCH_PHRASE_MESSAGE,
    LAUNCH_PHRASE_PATTERN,
    LAUNCH_TOKEN_MESSAGE,
    LAUNCH_TOKEN_PATTERN,
} from '../../settings/values.js';
import { assertOvhcloudCounterStrike2Server } from '../counterStrike2.js';

const START_PARAMS_ENV = 'CS2_START_PARAMS';
const UPDATE_ON_START_ENV = 'CS2_UPDATE_ON_START';

const INSECURE_FLAG = '-insecure';

const DEFAULT_START_PARAMS = '+game_type 0 +game_mode 0 +map de_dust2';

const GAME_TYPES: SettingOption[] = [
    { value: '0', label: 'Classic' },
    { value: '1', label: 'Gungame' },
    { value: '2', label: 'Training' },
    { value: '3', label: 'Custom' },
];

const GAME_MODES: Record<string, SettingOption[]> = {
    '0': [
        { value: '0', label: 'Casual' },
        { value: '1', label: 'Competitive' },
        { value: '2', label: 'Wingman' },
    ],
    '1': [
        { value: '0', label: 'Arms Race' },
        { value: '1', label: 'Demolition' },
        { value: '2', label: 'Deathmatch' },
    ],
    '2': [{ value: '0', label: 'Training' }],
    '3': [{ value: '0', label: 'Custom' }],
};

const MAPS: SettingOption[] = [
    { value: 'de_dust2', label: 'Dust II' },
    { value: 'de_mirage', label: 'Mirage' },
    { value: 'de_inferno', label: 'Inferno' },
    { value: 'de_overpass', label: 'Overpass' },
    { value: 'de_nuke', label: 'Nuke' },
    { value: 'de_ancient', label: 'Ancient' },
    { value: 'de_anubis', label: 'Anubis' },
    { value: 'de_cache', label: 'Cache' },
    { value: 'cs_office', label: 'Office' },
    { value: 'cs_italy', label: 'Italy' },
    { value: 'cs_alpine', label: 'Alpine' },
    { value: 'ar_baggage', label: 'Baggage' },
    { value: 'ar_pool_day', label: 'Pool Day' },
];

const token = {
    pattern: LAUNCH_TOKEN_PATTERN,
    patternMessage: LAUNCH_TOKEN_MESSAGE,
} as const;

const phrase = {
    pattern: LAUNCH_PHRASE_PATTERN,
    patternMessage: LAUNCH_PHRASE_MESSAGE,
} as const;

const COUNTER_STRIKE_2_LAUNCH_DEFINITIONS: SettingDefinition[] = [
    {
        key: 'hostname',
        group: 'branding',
        type: 'string',
        label: 'Server name',
        description: 'Name shown in the in-game server browser.',
        default: '',
        ...phrase,
    },
    {
        key: 'maxplayers',
        group: 'players',
        type: 'integer',
        label: 'Maximum players',
        description: 'Maximum number of players allowed on the server.',
        min: 1,
        max: 64,
        nullable: true,
        default: '',
    },
    {
        key: 'map',
        group: 'world',
        type: 'select',
        label: 'Map',
        description: 'Map loaded when the server starts. Any workshop or custom map name is accepted.',
        options: MAPS,
        freeform: true,
        default: 'de_dust2',
        ...token,
    },
    {
        key: 'game_type',
        group: 'gameplay',
        type: 'select',
        label: 'Game type',
        description: 'Family of game modes the server runs.',
        options: GAME_TYPES,
        freeform: true,
        default: '0',
        refreshes: ['game_mode'],
        ...token,
    },
    {
        key: 'game_mode',
        group: 'gameplay',
        type: 'select',
        label: 'Game mode',
        description: 'Game mode within the selected game type.',
        options: GAME_MODES['0'],
        freeform: true,
        default: '0',
        dependsOn: 'game_type',
        ...token,
    },
    {
        key: 'sv_password',
        group: 'security',
        type: 'string',
        label: 'Server password',
        description: 'Players will need to enter this password to join. Leave empty to make the server public.',
        secret: true,
        default: '',
        ...token,
    },
    {
        key: 'rcon_password',
        group: 'security',
        type: 'string',
        label: 'Admin password (RCON)',
        description: 'Used to remotely control the server via console commands. Keep it secret.',
        secret: true,
        default: '',
        ...token,
    },
    {
        key: 'sv_setsteamaccount',
        group: 'security',
        type: 'string',
        label: 'Steam GSL token',
        description: 'Required to make your server appear in the official server browser. Get it from steamcommunity.com/dev/managegameservers.',
        secret: true,
        default: '',
        ...token,
    },
    {
        key: 'vac',
        group: 'security',
        type: 'boolean',
        label: 'VAC anti-cheat',
        description: "Valve's official anti-cheat. Only turn it off for test or private servers.",
        default: true,
    },
    {
        key: 'updateOnStart',
        group: 'updates',
        type: 'boolean',
        label: 'Update on start',
        description: 'When enabled, the server checks for and installs game updates via SteamCMD each time it starts.',
        default: true,
    },
];

const POOLED_CONVARS = new Map<string, string>([
    ['hostname', 'hostname'],
    ['maxplayers', 'maxplayers'],
    ['map', 'map'],
    ['game_type', 'game_type'],
    ['game_mode', 'game_mode'],
    ['sv_password', 'sv_password'],
    ['rcon_password', 'rcon_password'],
    ['sv_setsteamaccount', 'sv_setsteamaccount'],
]);

function gameModeOptions(gameType: string): SettingOption[] {
    return GAME_MODES[gameType] ?? [];
}

const COUNTER_STRIKE_2_LAUNCH_SETTINGS: LaunchSettingsAccessor = {
    definitions(server: GameServerRow, env: EnvMap): SettingDefinition[] {
        assertOvhcloudCounterStrike2Server(server);

        const tokens = parsePooledParams(env.get(START_PARAMS_ENV) ?? DEFAULT_START_PARAMS);
        const gameType = getPooledParam(tokens, 'game_type') ?? '0';

        return COUNTER_STRIKE_2_LAUNCH_DEFINITIONS.map((definition) =>
            definition.key === 'game_mode'
                ? { ...definition, options: gameModeOptions(gameType) }
                : definition
        );
    },

    read(_server: GameServerRow, env: EnvMap): Map<string, SettingValue> {
        const tokens = parsePooledParams(env.get(START_PARAMS_ENV) ?? DEFAULT_START_PARAMS);
        const values = new Map<string, SettingValue>();

        for (const [key, convar] of POOLED_CONVARS) {
            const raw = getPooledParam(tokens, convar);
            if (raw === null) continue;

            if (key === 'maxplayers') {
                const numeric = Number(raw);
                values.set(key, Number.isInteger(numeric) ? numeric : '');
                continue;
            }

            values.set(key, raw);
        }

        values.set('vac', !hasPooledFlag(tokens, INSECURE_FLAG));
        values.set('updateOnStart', (env.get(UPDATE_ON_START_ENV) ?? 'true') !== 'false');

        return values;
    },

    apply(_server: GameServerRow, env: EnvMap, updates: Map<string, SettingValue>): EnvMap {
        let tokens = parsePooledParams(env.get(START_PARAMS_ENV) ?? DEFAULT_START_PARAMS);

        for (const [key, value] of updates) {
            if (key === 'updateOnStart') {
                env.set(UPDATE_ON_START_ENV, value ? 'true' : 'false');
                continue;
            }

            if (key === 'vac') {
                tokens = setPooledFlag(tokens, INSECURE_FLAG, value === false);
                continue;
            }

            const convar = POOLED_CONVARS.get(key);
            if (convar) tokens = setPooledParam(tokens, convar, String(value));
        }

        env.set(START_PARAMS_ENV, serializePooledParams(tokens));
        return env;
    },

    async resolveOptions(
        server: GameServerRow,
        key: string,
        params: Record<string, string>
    ): Promise<SettingOption[]> {
        assertOvhcloudCounterStrike2Server(server);
        if (key !== 'game_mode') return [];
        return gameModeOptions(params.game_type ?? '0');
    },
};

export function counterStrike2LaunchSettingsAccessor(): LaunchSettingsAccessor {
    return COUNTER_STRIKE_2_LAUNCH_SETTINGS;
}
