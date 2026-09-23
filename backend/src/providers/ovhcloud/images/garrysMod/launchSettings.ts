import type { GameServerRow } from '../../../../types/gameServer.js';
import {
    getPooledParam,
    parsePooledParams,
    serializePooledParams,
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
import { assertOvhcloudGarrysModServer } from '../garrysMod.js';

const START_PARAMS_ENV = 'GMOD_START_PARAMS';
const MOUNT_CSS_ENV = 'GMOD_MOUNT_CSS';
const UPDATE_ON_START_ENV = 'GMOD_UPDATE_ON_START';

const MAPS: SettingOption[] = [
    { value: 'gm_construct', label: 'Construct' },
    { value: 'gm_flatgrass', label: 'Flatgrass' },
];

const GAMEMODES: SettingOption[] = [
    { value: 'sandbox', label: 'Sandbox' },
    { value: 'terrortown', label: 'Trouble in Terrorist Town' },
];

const token = {
    pattern: LAUNCH_TOKEN_PATTERN,
    patternMessage: LAUNCH_TOKEN_MESSAGE,
} as const;

const phrase = {
    pattern: LAUNCH_PHRASE_PATTERN,
    patternMessage: LAUNCH_PHRASE_MESSAGE,
} as const;

const GARRYS_MOD_LAUNCH_DEFINITIONS: SettingDefinition[] = [
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
        max: 128,
        default: 128,
    },
    {
        key: 'map',
        group: 'world',
        type: 'select',
        label: 'Map',
        description: 'Map loaded when the server starts. Any workshop or custom map name is accepted.',
        options: MAPS,
        freeform: true,
        default: 'gm_construct',
        ...token,
    },
    {
        key: 'gamemode',
        group: 'gameplay',
        type: 'select',
        label: 'Game mode',
        description: 'Game mode the server runs. Any game mode installed from the workshop collection is accepted (e.g. darkrp).',
        options: GAMEMODES,
        freeform: true,
        default: 'sandbox',
        ...token,
    },
    {
        key: 'host_workshop_collection',
        group: 'gameplay',
        type: 'string',
        label: 'Workshop collection',
        description: 'Steam Workshop collection id whose addons the server downloads at start. The collection must be public or unlisted.',
        default: '',
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
        key: 'mountCss',
        group: 'gameplay',
        type: 'boolean',
        label: 'Counter-Strike: Source content',
        description: 'Download Counter-Strike: Source content and mount it. Needed by addons that reuse its textures and models; players need the game too. Adds a multi-gigabyte download on the next start.',
        default: false,
    },
    {
        key: 'host_workshop_autoupdate',
        group: 'updates',
        type: 'boolean',
        label: 'Update workshop addons',
        description: 'When enabled, the workshop collection addons are updated on every start.',
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
    ['gamemode', 'gamemode'],
    ['host_workshop_collection', 'host_workshop_collection'],
    ['sv_password', 'sv_password'],
    ['rcon_password', 'rcon_password'],
    ['sv_setsteamaccount', 'sv_setsteamaccount'],
]);

const GARRYS_MOD_LAUNCH_SETTINGS: LaunchSettingsAccessor = {
    definitions(server: GameServerRow): SettingDefinition[] {
        assertOvhcloudGarrysModServer(server);
        return GARRYS_MOD_LAUNCH_DEFINITIONS;
    },

    read(_server: GameServerRow, env: EnvMap): Map<string, SettingValue> {
        const tokens = parsePooledParams(env.get(START_PARAMS_ENV) ?? '');
        const values = new Map<string, SettingValue>();

        for (const [key, convar] of POOLED_CONVARS) {
            const raw = getPooledParam(tokens, convar);
            if (raw === null) continue;

            if (key === 'maxplayers') {
                const numeric = Number(raw);
                if (Number.isInteger(numeric)) values.set(key, numeric);
                continue;
            }

            values.set(key, raw);
        }

        const autoUpdate = getPooledParam(tokens, 'host_workshop_autoupdate');
        if (autoUpdate !== null) values.set('host_workshop_autoupdate', autoUpdate !== '0');

        values.set('mountCss', (env.get(MOUNT_CSS_ENV) ?? 'false') === 'true');
        values.set('updateOnStart', (env.get(UPDATE_ON_START_ENV) ?? 'true') !== 'false');

        return values;
    },

    apply(_server: GameServerRow, env: EnvMap, updates: Map<string, SettingValue>): EnvMap {
        let tokens = parsePooledParams(env.get(START_PARAMS_ENV) ?? '');

        for (const [key, value] of updates) {
            if (key === 'mountCss') {
                env.set(MOUNT_CSS_ENV, value ? 'true' : 'false');
                continue;
            }

            if (key === 'updateOnStart') {
                env.set(UPDATE_ON_START_ENV, value ? 'true' : 'false');
                continue;
            }

            if (key === 'host_workshop_autoupdate') {
                tokens = setPooledParam(tokens, key, value ? '1' : '0');
                continue;
            }

            const convar = POOLED_CONVARS.get(key);
            if (convar) tokens = setPooledParam(tokens, convar, String(value));
        }

        env.set(START_PARAMS_ENV, serializePooledParams(tokens));
        return env;
    },
};

export function garrysModLaunchSettingsAccessor(): LaunchSettingsAccessor {
    return GARRYS_MOD_LAUNCH_SETTINGS;
}
