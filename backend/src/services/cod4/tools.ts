import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { GameServerRow } from '../../types/gameServer.js';
import { buildServerNetworkAlias } from '../../utils/docker.js';
import { getServerStoragePaths } from '../../utils/storage.js';
import { GAME_PORT_LABEL, resolveContainerPort } from '../players/resolve.js';
import { parseStoredPorts } from '../../providers/runtimeConfig.js';
import { getConfig } from '../../config.js';

// Call of Duty 4 (CoD4X) over its own UDP protocol: getstatus (no password) and rcon (the password from the startup
// line). The panel's backend reaches each game container on the games network by its alias.

const PREFIX = Buffer.from([0xff, 0xff, 0xff, 0xff]);

// the game port inside the container: the UDP port labelled "game", else the server's first UDP port, else 28960
export function cod4Target(server: GameServerRow): { host: string; port: number } {
    const firstUdp = parseStoredPorts(server).udp[0]?.container;
    const fallback = typeof firstUdp === 'number' && firstUdp > 0 ? firstUdp : 28960;
    return { host: buildServerNetworkAlias(server.id), port: resolveContainerPort(server, 'udp', GAME_PORT_LABEL, fallback) };
}

// the address players connect to: the panel's public IPv4 (its domain) and the host UDP port of the game port.
// Inside its container CoD4X only knows 0.0.0.0 and the container port (status shows udp/ip: 0.0.0.0:28960).
let publicIp: { at: number; ip: string | null } | null = null;

export async function cod4PublicAddress(server: GameServerRow): Promise<string> {
    if (!publicIp || Date.now() - publicIp.at > 3600_000) {
        const ip = await dns
            .lookup(getConfig().domain, { family: 4 })
            .then((r) => r.address)
            .catch(() => null);
        publicIp = { at: Date.now(), ip };
    }
    const container = cod4Target(server).port;
    const hostPort = parseStoredPorts(server).udp.find((p) => p.container === container)?.host ?? container;
    return `${publicIp.ip ?? getConfig().domain}:${hostPort}`;
}

// sends one packet and collects every answer for a moment (rcon answers come in several packets)
function exchange(host: string, port: number, payload: Buffer, waitMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        const parts: Buffer[] = [];
        let timer: NodeJS.Timeout | null = null;
        const finish = () => {
            socket.close();
            resolve(
                parts
                    .map((part) => part.subarray(4).toString('latin1').replace(/^print\n|^statusResponse\n/, ''))
                    .join('')
            );
        };
        const arm = (ms: number) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(finish, ms);
        };
        socket.on('message', (message) => {
            parts.push(message);
            arm(250);
        });
        socket.on('error', (error) => {
            if (timer) clearTimeout(timer);
            socket.close();
            reject(error);
        });
        socket.send(Buffer.concat([PREFIX, payload]), port, host, (error) => {
            if (error) {
                socket.close();
                reject(error);
            } else {
                arm(waitMs);
            }
        });
    });
}

// "+rcon_password X" (or the older "+set rcon_password X") on the startup line, like the Command line card writes it
export async function readRconPassword(server: GameServerRow): Promise<string | null> {
    const configDir = path.join(getServerStoragePaths(server.id).dataDir, 'config-lgsm', 'cod4server');
    const read = (name: string) => fs.readFile(path.join(configDir, name), 'utf8').catch(() => '');
    const files = await Promise.all(
        ['secrets-cod4server.cfg', 'cod4server.cfg', 'secrets-common.cfg', 'common.cfg', '_default.cfg'].map(read)
    );
    for (const content of files) {
        const line = /^\s*startparameters=(.*)$/m.exec(content)?.[1];
        if (line === undefined) continue;
        const match = /\+(?:set\s+)?rcon_password\s+\\?"?([^\s"\\]+)/i.exec(line);
        if (!match) return null;
        if (match[1] === '${rconpassword}') {
            for (const secret of files) {
                const value = /^\s*rconpassword\s*=\s*"?([^"\n]*)"?/m.exec(secret)?.[1];
                if (value) return value;
            }
            return null;
        }
        return match[1];
    }
    return null;
}

export async function rcon(server: GameServerRow, command: string, waitMs = 1500): Promise<string> {
    const password = await readRconPassword(server);
    if (!password) {
        throw Object.assign(new Error('This server has no RCON password (Settings > Game config > Command line).'), { statusCode: 409 });
    }
    const { host, port } = cod4Target(server);
    const answer = await exchange(host, port, Buffer.from(`rcon ${password} ${command}`, 'latin1'), waitMs);
    if (/bad rcon/i.test(answer)) {
        throw Object.assign(new Error('The server refused the RCON password (restart it after changing the password).'), { statusCode: 409 });
    }
    return answer;
}

export type Cod4Status = {
    hostname: string | null;
    map: string | null;
    gametype: string | null;
    maxPlayers: number | null;
    players: Array<{ name: string; score: number; ping: number }>;
};

const stripColors = (text: string) => text.replace(/\^[0-9a-zA-Z]/g, '');

// getstatus: the server's settings and players, no password needed
export async function getStatus(server: GameServerRow, waitMs = 1000): Promise<Cod4Status | null> {
    const { host, port } = cod4Target(server);
    const answer = await exchange(host, port, Buffer.from('getstatus', 'latin1'), waitMs).catch(() => '');
    if (!answer) return null;
    const [infoLine, ...lines] = answer.split('\n');
    const parts = infoLine.split('\\').slice(1);
    const info: Record<string, string> = {};
    for (let i = 0; i + 1 < parts.length; i += 2) info[parts[i].toLowerCase()] = parts[i + 1];
    const players = lines
        .map((line) => /^(-?\d+)\s+(\d+)\s+"(.*)"$/.exec(line.trim()))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => ({ score: Number(m[1]), ping: Number(m[2]), name: stripColors(m[3]) }));
    return {
        hostname: info.sv_hostname ? stripColors(info.sv_hostname) : null,
        map: info.mapname ?? null,
        gametype: info.g_gametype ?? null,
        maxPlayers: info.sv_maxclients ? Number(info.sv_maxclients) : null,
        players,
    };
}

export type Cod4Player = {
    slot: number;
    score: number;
    ping: string;
    guid: string;
    steamId: string;
    name: string;
    ip: string | null;
};

// CoD4X "status":
// num score ping playerid            steamid           name                             lastmsg address    qport rate
//   2     0   48 1234567890123456789 76561198000000000 Player^7                                  0 1.2.3.4:28960 12345 25000
export function parseRconStatus(text: string): { map: string | null; players: Cod4Player[] } {
    const map = /^map\s*:\s*(\S+)/im.exec(text)?.[1] ?? null;
    const players: Cod4Player[] = [];
    for (const line of text.split('\n')) {
        const m =
            /^\s*(\d+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*?)\s+(\d+)\s+(\S+?)(?::-?\d+)?\s+-?\d+\s+\d+\s*$/.exec(line);
        if (!m) continue;
        const address = m[8];
        players.push({
            slot: Number(m[1]),
            score: Number(m[2]),
            ping: m[3],
            guid: m[4],
            steamId: m[5],
            name: stripColors(m[6]),
            ip: /^\d{1,3}(\.\d{1,3}){3}$/.test(address) ? address : null,
        });
    }
    return { map, players };
}

// stock CoD4 multiplayer maps
export const STOCK_MAPS = [
    'mp_backlot', 'mp_bloc', 'mp_bog', 'mp_broadcast', 'mp_carentan', 'mp_cargoship', 'mp_citystreets', 'mp_convoy',
    'mp_countdown', 'mp_crash', 'mp_crash_snow', 'mp_creek', 'mp_crossfire', 'mp_farm', 'mp_killhouse', 'mp_overgrown',
    'mp_pipeline', 'mp_shipment', 'mp_showdown', 'mp_strike', 'mp_vacant',
];

export const GAMETYPES = ['war', 'dm', 'sd', 'dom', 'koth', 'sab'];
