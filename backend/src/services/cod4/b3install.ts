import fs from 'node:fs/promises';
import path from 'node:path';
import { serverRepository } from '../../database/index.js';
import { parseStoredPorts } from '../../providers/runtimeConfig.js';
import { getServerStoragePaths } from '../../utils/storage.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import { readRconPassword } from './tools.js';

// B3 for a new CoD4 server (Admin page > CoD4 files > Defaults for new servers > B3): the same steps as the B3 card's
// Install B3 button, done by the panel: the B3 service unpacks B3 into the server's b3/ folder and makes its database,
// the panel writes b3/b3/conf/b3.xml (same default config as the card) and starts B3.

const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const b3DefaultConfig = (v: { database: string; rcon: string; port: string; gameLog: string; ip: string }) => `<configuration>
<!--
 B3 main config, made by the panel (B3 for new servers, Admin page). For any change made in this config file, restart the bot.
 Whenever you can specify a file/directory path, the following shortcuts can be used:
    @b3 : the folder where B3 code is installed in (b3/app/b3)
    @conf : the folder containing this config file
 -->
    <settings name="b3">
        <!-- cod4x18: CoD4X without the b3hide plugin (players from "status"); cod4x needs b3hide (b3status) -->
        <set name="parser">cod4x18</set>
        <!-- Your database info: [protocol]://[db-user]:[db-password]@[db-server[:port]]/[db-name] -->
        <set name="database">${xmlEscape(v.database)}</set>
        <set name="bot_name">CWP-Bot</set>
        <set name="bot_prefix">^0(^5CWP-Bot5^0)^5:</set>
        <set name="time_format">%I:%M%p %Z %m/%d/%y</set>
        <set name="time_zone">CEST</set>
        <!-- How much detail in the b3 logfile: 9 = verbose, 10 = debug, 21 = bot, 22 = console -->
        <set name="log_level">9</set>
        <set name="logfile">b3.log</set>
    </settings>
    <settings name="server">
        <!-- The RCON password of the game server (Command line card) -->
        <set name="rcon_password">${xmlEscape(v.rcon || 'set-the-rcon-password')}</set>
        <set name="port">${xmlEscape(v.port || '28960')}</set>
        <!-- B3 sees this server's folder as /data -->
        <set name="game_log">${xmlEscape(v.gameLog)}</set>
        <!-- The public IP of the game server, and the IP the bot sends RCON commands to -->
        <set name="public_ip">${xmlEscape(v.ip)}</set>
        <set name="rcon_ip">${xmlEscape(v.ip)}</set>
        <set name="punkbuster">off</set>
        <set name="delay">0.33</set>
        <set name="lines_per_second">50</set>
    </settings>
    <settings name="autodoc">
        <set name="type">html</set>
        <set name="maxlevel">100</set>
    </settings>
    <settings name="update">
        <set name="channel">stable</set>
    </settings>
    <settings name="messages">
        <set name="kicked_by">$clientname^7 was kicked by $adminname^7 $reason</set>
        <set name="kicked">$clientname^7 was kicked $reason</set>
        <set name="banned_by">$clientname^7 was banned by $adminname^7 $reason</set>
        <set name="banned">$clientname^7 was banned $reason</set>
        <set name="temp_banned_by">$clientname^7 was temp banned by $adminname^7 for $banduration^7 $reason</set>
        <set name="temp_banned">$clientname^7 was temp banned for $banduration^7 $reason</set>
        <set name="unbanned_by">$clientname^7 was un-banned by $adminname^7 $reason</set>
        <set name="unbanned">$clientname^7 was un-banned^7 $reason</set>
    </settings>
    <settings name="plugins">
        <set name="external_dir">@b3/extplugins</set>
    </settings>
    <plugins>
        <plugin name="admin" config="@b3/conf/plugin_admin.ini" />
        <plugin name="adv" config="@b3/conf/plugin_adv.xml" />
        <plugin name="banlist" config="@b3/conf/plugin_banlist.xml" />
        <plugin name="censor" config="@b3/conf/plugin_censor.xml" />
        <plugin name="cmdmanager" config="@b3/conf/plugin_cmdmanager.ini" />
        <plugin name="pingwatch" config="@b3/conf/plugin_pingwatch.ini" />
        <plugin name="pluginmanager" config="@b3/conf/plugin_pluginmanager.ini" />
        <plugin name="stats" config="@b3/conf/plugin_stats.ini" />
        <plugin name="status" config="@b3/conf/plugin_status.ini" />
        <plugin name="welcome" config="@b3/conf/plugin_welcome.ini" />
        <plugin name="countryfilter" config="@b3/conf/plugin_countryfilter.ini" />
        <plugin name="customcommands" config="@b3/conf/plugin_customcommands.ini" />
        <plugin name="firstkill" config="@b3/conf/plugin_firstkill.ini" />
        <plugin name="geowelcome" config="@b3/conf/plugin_geowelcome.ini" />
        <plugin name="location" config="@b3/conf/plugin_location.ini" />
        <plugin name="ipban" config="@b3/conf/plugin_ipban.ini" />
        <plugin name="nickreg" config="@b3/conf/plugin_nickreg.ini" />
        <plugin name="spawnkill" config="@b3/conf/plugin_spawnkill.ini" />
    </plugins>
</configuration>
`;

type B3Status = { heartbeat?: number; database?: { url?: string } | null; serverIp?: string; lastAction?: { id?: string; result?: string; message?: string } | null };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readStatus(b3: string): Promise<B3Status> {
    try {
        return JSON.parse(await fs.readFile(path.join(b3, 'status.json'), 'utf8')) as B3Status;
    } catch {
        return {};
    }
}

async function control(b3: string, action: string): Promise<string> {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(path.join(b3, 'control.json'), `${JSON.stringify({ action, id }, null, 2)}\n`, 'utf8');
    return id;
}

async function waitFor(b3: string, done: (status: B3Status) => boolean, seconds: number): Promise<B3Status> {
    let status: B3Status = {};
    for (let i = 0; i < seconds / 2; i++) {
        status = await readStatus(b3);
        if (done(status)) return status;
        await wait(2000);
    }
    return status;
}

export async function autoInstallB3(serverId: number, mod: string): Promise<void> {
    const server = await serverRepository.findById(serverId);
    if (!server) return;
    const dataDir = getServerStoragePaths(serverId).dataDir;
    const b3 = path.join(dataDir, 'b3');
    try {
        // the B3 service looks after servers that have a b3 folder
        await fs.mkdir(b3, { recursive: true });
        let status = await waitFor(b3, (s) => Boolean(s.heartbeat && s.database), 90);
        if (!status.heartbeat) throw new Error('the B3 service (gamepanel-b3) does not answer');
        const id = await control(b3, 'install');
        status = await waitFor(b3, (s) => s.lastAction?.id === id, 180);
        if (status.lastAction?.id !== id) throw new Error('the B3 service did not finish the install');
        if (status.lastAction.result === 'error') throw new Error(status.lastAction.message ?? 'install failed');

        const confDir = path.join(b3, 'b3', 'conf');
        const config = path.join(confDir, 'b3.xml');
        if (!(await fs.access(config).then(() => true, () => false))) {
            const port = parseStoredPorts(server).udp[0]?.host ?? 28960;
            await fs.mkdir(confDir, { recursive: true });
            await fs.writeFile(
                config,
                b3DefaultConfig({
                    database: status.database?.url ?? '',
                    rcon: (await readRconPassword(server)) ?? '',
                    port: String(port),
                    gameLog: `/data/serverfiles/${mod ? `mods/${mod}` : 'main'}/games_mp.log`,
                    ip: status.serverIp || '127.0.0.1',
                }),
                'utf8'
            );
        }
        await control(b3, 'start');
        logInfo('ADMIN:B3', 'B3 installed and started for the new server', { serverId });
    } catch (error) {
        logWarn('ADMIN:B3', `B3 for the new server: ${error instanceof Error ? error.message : String(error)}`, { serverId });
    }
}
