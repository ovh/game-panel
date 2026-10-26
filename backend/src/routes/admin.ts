import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Router, type Response } from 'express';
import { authMiddleware, rootOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { getConfig } from '../config.js';
import { serverRepository } from '../database/index.js';
import { docker } from '../utils/docker/client.js';
import { getServerStoragePaths } from '../utils/storage.js';
import type { GameServerRow } from '../types/gameServer.js';
import { GAMETYPES, STOCK_MAPS, cod4PublicAddress, getStatus, parseRconStatus, rcon } from '../services/cod4/tools.js';
import { b3DatabaseSize, b3Query, backupB3Database, findB3Config, readB3Database, restoreB3Database } from '../services/cod4/b3db.js';
import { readActivity } from '../middleware/activityLog.js';
import { readAdminSettings, writeAdminSettings } from '../services/cod4/settings.js';
import { backupServerConfigs, deleteBackup, listBackups, runAutoBackup, startAutoBackupScheduler } from '../services/cod4/backups.js';
import { checkCod4Files, cod4FilesDir, cod4FilesHostDir } from '../providers/linuxgsm/adapters/cod4/index.js';
import { certificateInfo } from '../services/cod4/cert.js';
import { writeBranding } from './branding.js';

// Admin page (Super Admins): everything the panel can tell about the servers' add-ons (B3, FastDL), the host and what
// needs attention, in one call. Server status, metrics and players come from the endpoints the panel already uses.
const router = Router();
router.use(authMiddleware, rootOnly);

// daily backups (Admin → Backups); the backend loads this file at start
startAutoBackupScheduler();

type Alert = { level: 'error' | 'warning'; text: string; serverId?: number };

async function readJson<T>(file: string): Promise<T | null> {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch {
        return null;
    }
}

async function exists(file: string): Promise<boolean> {
    return fs.access(file).then(() => true, () => false);
}

// statuses that are on their way somewhere: no alert while a server is in one of them
const MOVING = new Set(['starting', 'restarting', 'stopping', 'installing', 'creating', 'updating']);

type B3Status = { state?: string; heartbeat?: number; lastAction?: { action?: string; result?: string } | null };

async function b3Info(dataDir: string) {
    const b3 = path.join(dataDir, 'b3');
    if (!(await exists(b3))) return null;
    const status = await readJson<B3Status>(path.join(b3, 'status.json'));
    const heartbeatAge = typeof status?.heartbeat === 'number' ? Math.round(Date.now() / 1000 - status.heartbeat) : null;
    return {
        state: status?.state ?? 'unknown',
        // B3 should run when its last action in the panel was Start (or Restart) and that worked
        wanted: ['start', 'restart'].includes(status?.lastAction?.action ?? '') && status?.lastAction?.result !== 'error',
        heartbeatAge,
    };
}

// FastDL on for a CoD4 server: sv_wwwDownload 1 on its startup line (LinuxGSM instance config)
async function fastDlOn(dataDir: string): Promise<boolean | null> {
    const configDir = path.join(dataDir, 'config-lgsm', 'cod4server');
    if (!(await exists(configDir))) return null;
    for (const name of ['secrets-cod4server.cfg', 'cod4server.cfg', 'secrets-common.cfg', 'common.cfg']) {
        const content = await fs.readFile(path.join(configDir, name), 'utf8').catch(() => '');
        const line = /^\s*startparameters=(.*)$/m.exec(content)?.[1];
        if (line !== undefined) return /\+set\s+sv_wwwDownload\s+\\?"?1/i.test(line);
    }
    return false;
}

async function diskOf(dir: string) {
    try {
        const st = await fs.statfs(dir);
        const total = st.blocks * st.bsize;
        const free = st.bavail * st.bsize;
        return { total, free, used: total - free };
    } catch {
        return null;
    }
}

// folder sizes (counting hard-linked files once), cached: walking a few servers takes a moment
let sizeCache: { at: number; sizes: Record<string, number> } | null = null;

async function folderSize(dir: string, seen: Set<string>): Promise<number> {
    let total = 0;
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            total += await folderSize(full, seen);
        } else if (entry.isFile()) {
            const st = await fs.lstat(full).catch(() => null);
            if (!st) continue;
            const id = `${st.dev}:${st.ino}`;
            if (seen.has(id)) continue;
            seen.add(id);
            total += st.size;
        }
    }
    return total;
}

async function folderSizes(serverIds: number[]): Promise<Record<string, number>> {
    if (sizeCache && Date.now() - sizeCache.at < 5 * 60_000) return sizeCache.sizes;
    const sizes: Record<string, number> = {};
    // the shared CoD4 files first, so each server only counts what is its own
    const seen = new Set<string>();
    sizes['cod4-linux'] = await folderSize(path.join(getConfig().gamepanelDataDir, 'cod4-linux'), seen);
    for (const id of serverIds) {
        sizes[String(id)] = await folderSize(getServerStoragePaths(id).serverRoot, seen);
    }
    sizeCache = { at: Date.now(), sizes };
    return sizes;
}

router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const alerts: Alert[] = [];
        const dataRoot = getConfig().gamepanelDataDir;
        const rows = await serverRepository.listAll();

        // ---- servers: add-ons and state
        const servers = await Promise.all(
            rows.map(async (row) => {
                const dataDir = getServerStoragePaths(row.id).dataDir;
                const isCod4 = row.catalog_id === 'cod4';
                const [b3, fastdl] = isCod4 ? await Promise.all([b3Info(dataDir), fastDlOn(dataDir)]) : [null, null];
                const status = String(row.status ?? 'unknown');
                if (row.desired_state === 'running' && status !== 'running' && !MOVING.has(status)) {
                    alerts.push({ level: 'error', text: `${row.name} should be running but is ${status}.`, serverId: row.id });
                }
                if (b3?.wanted && b3.state !== 'running') {
                    alerts.push({ level: 'error', text: `${row.name}: B3 is ${b3.state}.`, serverId: row.id });
                }
                // CoD4 players straight from the server (the panel's own players query does not cover LinuxGSM games)
                const live = isCod4 && status === 'running' ? await getStatus(row, 800).catch(() => null) : null;
                const players = live ? { online: live.players.length, max: live.maxPlayers, map: live.map } : null;
                return { id: row.id, name: row.name, catalogId: row.catalog_id, status, desiredState: row.desired_state, b3, fastdl, players };
            })
        );
        const b3Ages = servers.map((s) => s.b3?.heartbeatAge).filter((age): age is number => typeof age === 'number');
        if (b3Ages.length > 0 && Math.min(...b3Ages) > 180) {
            alerts.push({ level: 'warning', text: 'The B3 service (gamepanel-b3) has not reported for a while: systemctl status gamepanel-b3' });
        }

        // ---- FastDL
        const fastdlDir = path.join(dataRoot, 'fastdl');
        const info = await readJson<{ url?: string; browserUrl?: string }>(path.join(fastdlDir, 'fastdl.json'));
        let fastdl: Record<string, unknown> = { installed: false };
        if (info?.url) {
            const manifest = (await readJson<string[]>(path.join(fastdlDir, 'manifest.json'))) ?? [];
            const status = await readJson<{ time?: number; ok?: boolean; error?: string }>(path.join(fastdlDir, 'status.json'));
            const running = await docker
                .getContainer('gamepanel-fastdl')
                .inspect()
                .then((c) => Boolean(c.State?.Running))
                .catch(() => false);
            const syncAge = typeof status?.time === 'number' ? Math.round(Date.now() / 1000 - status.time) : null;
            const published: Record<string, number> = {};
            for (const rel of manifest) {
                const key = rel.split('/')[0];
                published[key] = (published[key] ?? 0) + 1;
            }
            fastdl = {
                installed: true,
                url: info.url,
                browserUrl: info.browserUrl || null,
                running,
                lastSync: typeof status?.time === 'number' ? Math.round(status.time * 1000) : null,
                serviceAlive: syncAge !== null && syncAge < 120,
                published,
            };
            if (!running) alerts.push({ level: 'error', text: 'The FastDL web server (gamepanel-fastdl) is not running: bash gp-fastdl.sh' });
            if (syncAge === null || syncAge >= 120) {
                alerts.push({ level: 'warning', text: 'The FastDL sync service is not running: systemctl status gamepanel-fastdl' });
            } else if (status?.ok === false) {
                alerts.push({ level: 'error', text: `FastDL sync failed: ${status.error ?? 'unknown error'}` });
            }
        }

        // ---- host
        const disk = await diskOf(getConfig().gamepanelServersDir);
        if (disk && disk.total > 0) {
            const usedPct = (disk.used / disk.total) * 100;
            if (usedPct >= 95) alerts.push({ level: 'error', text: `The disk is ${usedPct.toFixed(0)}% full.` });
            else if (usedPct >= 85) alerts.push({ level: 'warning', text: `The disk is ${usedPct.toFixed(0)}% full.` });
        }
        const memory = { total: os.totalmem(), free: os.freemem() };
        if (memory.free / memory.total < 0.08) {
            alerts.push({ level: 'warning', text: `Little free memory: ${(memory.free / 1024 ** 3).toFixed(1)} GB of ${(memory.total / 1024 ** 3).toFixed(1)} GB.` });
        }
        const containers = await docker
            .listContainers({ all: true })
            .then((list) =>
                list
                    .map((c) => ({
                        name: (c.Names?.[0] ?? '').replace(/^\//, ''),
                        image: c.Image,
                        state: c.State,
                        status: c.Status,
                        project: c.Labels?.['com.docker.compose.project'] ?? null,
                    }))
                    // the panel's own containers and its add-ons; game servers are on the Overview tab
                    .filter((c) => c.project === getConfig().composeProjectName || /^gamepanel-/.test(c.name))
                    .sort((a, b) => a.name.localeCompare(b.name))
            )
            .catch(() => []);
        for (const c of containers) {
            if (c.state !== 'running' && !/^gamepanel-b3-\d+/.test(c.name)) {
                alerts.push({ level: 'warning', text: `Container ${c.name} is ${c.state}.` });
            }
        }

        // ---- the panel's HTTPS certificate
        const cert = await certificateInfo();
        if (cert?.daysLeft !== undefined && cert.daysLeft !== null) {
            if (cert.daysLeft < 0) alerts.push({ level: 'error', text: `The HTTPS certificate of ${cert.host} has expired.` });
            else if (cert.daysLeft < 14) {
                alerts.push({ level: cert.daysLeft < 5 ? 'error' : 'warning', text: `The HTTPS certificate of ${cert.host} expires in ${cert.daysLeft} day(s).` });
            }
        }

        const sizes = req.query.sizes === '1' ? await folderSizes(rows.map((r) => r.id)) : null;
        return res.json({
            servers,
            fastdl,
            system: {
                hostname: os.hostname(),
                uptime: os.uptime(),
                load: os.loadavg(),
                cpus: os.cpus().length,
                memory,
                disk,
                containers,
                sizes,
                cert,
            },
            alerts,
        });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Could not build the overview' });
    }
});

// FastDL "Sync all": the same request file as the per-server button; the service syncs every server at once
router.post('/fastdl/sync', async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const stateDir = path.join(getConfig().gamepanelDataDir, 'fastdl');
        if (!(await readJson<{ url?: string }>(path.join(stateDir, 'fastdl.json')))?.url) {
            return res.status(409).json({ error: 'FastDL is not installed (run gp-fastdl.sh on the panel server)' });
        }
        const requestedAt = Date.now();
        await fs.writeFile(path.join(stateDir, 'sync-request'), String(requestedAt));
        for (let waited = 0; waited < 15000; waited += 500) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const status = await readJson<{ time?: number; ok?: boolean; error?: string; total?: number; added?: number; removed?: number }>(
                path.join(stateDir, 'status.json')
            );
            if (typeof status?.time === 'number' && status.time * 1000 >= requestedAt) {
                if (!status.ok) return res.status(500).json({ error: `FastDL sync failed: ${status.error ?? 'unknown error'}` });
                return res.json({ total: status.total ?? 0, added: status.added ?? 0, removed: status.removed ?? 0 });
            }
        }
        return res.status(504).json({ error: 'The FastDL service did not answer (systemctl status gamepanel-fastdl)' });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Could not start the FastDL sync' });
    }
});

// ---------------------------------------------------------------------------------------------------------------
// One CoD4 server: live players and RCON, maps, mods / maps on disk, B3 (plugins, admins, bans, backup)

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { statusCode: 400 });
}

async function cod4Server(id: unknown): Promise<GameServerRow> {
    const serverId = Number(id);
    const server = Number.isInteger(serverId) ? await serverRepository.findById(serverId) : null;
    if (!server) throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    if (server.catalog_id !== 'cod4') throw Object.assign(new Error('Only for Call of Duty 4 servers'), { statusCode: 400 });
    return server;
}

function fail(res: Response, error: unknown, fallback: string) {
    const statusCode = Number((error as { statusCode?: number })?.statusCode) || 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : fallback });
}

// text that goes into an rcon command: no line breaks or quotes, CoD4 colour codes allowed
const cleanArg = (value: unknown, max = 120) =>
    String(value ?? '')
        .replace(/[\x00-\x1f\x7f";]/g, '')
        .trim()
        .slice(0, max);

const serverfiles = (server: GameServerRow) => path.join(getServerStoragePaths(server.id).dataDir, 'serverfiles');

// live: players with slot, GUID and IP (rcon status), or the public view (getstatus) without an RCON password
router.get('/servers/:id/live', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const status = await getStatus(server);
        let detailed: ReturnType<typeof parseRconStatus> | null = null;
        let rconError: string | null = null;
        try {
            detailed = parseRconStatus(await rcon(server, 'status'));
        } catch (error) {
            rconError = error instanceof Error ? error.message : 'RCON failed';
        }
        return res.json({
            online: status !== null,
            hostname: status?.hostname ?? null,
            map: detailed?.map ?? status?.map ?? null,
            gametype: status?.gametype ?? null,
            maxPlayers: status?.maxPlayers ?? null,
            players: detailed?.players ?? (status?.players ?? []).map((p, i) => ({ slot: i, score: p.score, ping: String(p.ping), guid: '', steamId: '', name: p.name, ip: null })),
            rcon: rconError === null,
            rconError,
        });
    } catch (error) {
        return fail(res, error, 'Could not read the server');
    }
});

router.post('/servers/:id/rcon', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const command = String(req.body?.command ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, 300);
        if (!command) throw badRequest('Empty command');
        res.locals.activityDetail = `rcon ${command.split(' ')[0]}`;
        let output = await rcon(server, command, 2000);
        // status: the address players use instead of the container's 0.0.0.0
        if (/^udp\/ip\s*:\s*0\.0\.0\.0:\d+/m.test(output)) {
            const address = await cod4PublicAddress(server);
            output = output.replace(/^(udp\/ip\s*:\s*)0\.0\.0\.0:\d+/m, `$1${address}`);
        }
        return res.json({ output });
    } catch (error) {
        return fail(res, error, 'RCON failed');
    }
});

router.post('/servers/:id/players/:slot/:action', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const slot = Number(req.params.slot);
        if (!Number.isInteger(slot) || slot < 0 || slot > 128) throw badRequest('Invalid player slot');
        const reason = cleanArg(req.body?.reason) || 'admin decision';
        let command: string;
        if (req.params.action === 'kick') command = `clientkick ${slot} ${reason}`;
        else if (req.params.action === 'tempban') {
            const minutes = Math.max(1, Math.min(60 * 24 * 365, Math.round(Number(req.body?.minutes) || 60)));
            command = `tempban ${slot} ${minutes}m ${reason}`;
        } else if (req.params.action === 'ban') command = `permban ${slot} ${reason}`;
        else throw badRequest('Unknown action');
        res.locals.activityDetail = `${req.params.action} slot ${slot}: ${reason}`;
        return res.json({ output: await rcon(server, command) });
    } catch (error) {
        return fail(res, error, 'Could not do that');
    }
});

router.post('/servers/:id/say', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const message = cleanArg(req.body?.message, 150);
        if (!message) throw badRequest('Empty message');
        return res.json({ output: await rcon(server, `say "${message}"`) });
    } catch (error) {
        return fail(res, error, 'Could not send the message');
    }
});

// maps: stock + the server's usermaps, the rotation from main/cod4server.cfg
const MAP_NAME = /^[A-Za-z0-9_-]{1,64}$/;

async function serverConfigFile(server: GameServerRow): Promise<string> {
    return path.join(serverfiles(server), 'main', 'cod4server.cfg');
}

router.get('/servers/:id/maps', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const usermaps = (await fs.readdir(path.join(serverfiles(server), 'usermaps'), { withFileTypes: true }).catch(() => []))
            .filter((e) => e.isDirectory() && MAP_NAME.test(e.name))
            .map((e) => e.name)
            .sort();
        const cfg = await fs.readFile(await serverConfigFile(server), 'utf8').catch(() => '');
        const rotation = /^\s*set[as]?\s+sv_mapRotation\s+"([^"]*)"/im.exec(cfg)?.[1] ?? '';
        return res.json({ stock: STOCK_MAPS, usermaps, gametypes: GAMETYPES, rotation });
    } catch (error) {
        return fail(res, error, 'Could not read the maps');
    }
});

router.post('/servers/:id/map', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const map = String(req.body?.map ?? '');
        const gametype = String(req.body?.gametype ?? '');
        if (req.body?.rotate) return res.json({ output: await rcon(server, 'map_rotate') });
        if (!MAP_NAME.test(map)) throw badRequest('Invalid map name');
        if (gametype && GAMETYPES.includes(gametype)) await rcon(server, `g_gametype ${gametype}`);
        res.locals.activityDetail = `map ${map}`;
        return res.json({ output: await rcon(server, `map ${map}`, 3000) });
    } catch (error) {
        return fail(res, error, 'Could not change the map');
    }
});

// the rotation as a list of { gametype, map }, written to main/cod4server.cfg (a new file in place of the old one)
router.put('/servers/:id/rotation', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
        if (!entries || entries.length === 0 || entries.length > 200) throw badRequest('The rotation needs 1 to 200 maps');
        const parts: string[] = [];
        let lastType = '';
        for (const entry of entries) {
            const map = String(entry?.map ?? '');
            const gametype = String(entry?.gametype ?? '');
            if (!MAP_NAME.test(map)) throw badRequest(`Invalid map name: ${map}`);
            if (gametype && !GAMETYPES.includes(gametype)) throw badRequest(`Invalid gametype: ${gametype}`);
            if (gametype && gametype !== lastType) {
                parts.push(`gametype ${gametype}`);
                lastType = gametype;
            }
            parts.push(`map ${map}`);
        }
        const line = `set sv_mapRotation "${parts.join(' ')}"`;
        const file = await serverConfigFile(server);
        const current = await fs.readFile(file, 'utf8').catch(() => '');
        const pattern = /^\s*set[as]?\s+sv_mapRotation\s+.*$/im;
        const next = pattern.test(current) ? current.replace(pattern, line) : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`;
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(`${file}.tmp`, next, 'utf8');
        await fs.rename(`${file}.tmp`, file);
        // the running server takes the new rotation at once (it is used from the next map on)
        await rcon(server, line.replace(/^set /, 'set ')).catch(() => undefined);
        return res.json({ rotation: parts.join(' ') });
    } catch (error) {
        return fail(res, error, 'Could not save the rotation');
    }
});

// mods and usermaps on disk
const CONTENT_SECTIONS = new Set(['mods', 'usermaps']);
const FOLDER_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

router.get('/servers/:id/content', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const result: Record<string, Array<{ name: string; size: number; files: number }>> = {};
        for (const section of CONTENT_SECTIONS) {
            const base = path.join(serverfiles(server), section);
            const items = [];
            for (const entry of await fs.readdir(base, { withFileTypes: true }).catch(() => [])) {
                if (!entry.isDirectory()) continue;
                let size = 0;
                let files = 0;
                const walk = async (dir: string): Promise<void> => {
                    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
                        const full = path.join(dir, e.name);
                        if (e.isDirectory()) await walk(full);
                        else if (e.isFile()) {
                            files++;
                            size += (await fs.stat(full).catch(() => ({ size: 0 }))).size;
                        }
                    }
                };
                await walk(path.join(base, entry.name));
                items.push({ name: entry.name, size, files });
            }
            result[section] = items.sort((a, b) => a.name.localeCompare(b.name));
        }
        return res.json(result);
    } catch (error) {
        return fail(res, error, 'Could not read the mods and maps');
    }
});

function contentPath(server: GameServerRow, section: string, name: string): string {
    if (!CONTENT_SECTIONS.has(section) || !FOLDER_NAME.test(name) || name === '.' || name === '..') throw badRequest('Invalid folder');
    return path.join(serverfiles(server), section, name);
}

router.delete('/servers/:id/content/:section/:name', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        await fs.rm(contentPath(server, req.params.section, req.params.name), { recursive: true, force: true });
        res.locals.activityDetail = `deleted ${req.params.section}/${req.params.name}`;
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error, 'Could not delete');
    }
});

// copy a mod / map folder to another CoD4 server: big files as hard links, like new servers get them
async function copyTree(from: string, to: string): Promise<void> {
    await fs.mkdir(to, { recursive: true });
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
        const a = path.join(from, entry.name);
        const b = path.join(to, entry.name);
        if (entry.isDirectory()) await copyTree(a, b);
        else if (entry.isFile()) {
            await fs.rm(b, { force: true });
            const st = await fs.stat(a);
            if (st.size >= 1024 * 1024) {
                try {
                    await fs.link(a, b);
                    continue;
                } catch {
                    // another disk: copy
                }
            }
            await fs.copyFile(a, b);
        }
    }
}

router.post('/servers/:id/content/:section/:name/copy', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const target = await cod4Server(req.body?.targetId);
        if (target.id === server.id) throw badRequest('Choose another server');
        const from = contentPath(server, req.params.section, req.params.name);
        const to = contentPath(target, req.params.section, req.params.name);
        await copyTree(from, to);
        res.locals.activityDetail = `copied ${req.params.section}/${req.params.name} to server ${target.id}`;
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error, 'Could not copy');
    }
});

// ---- B3
async function writeB3Control(server: GameServerRow, action: string): Promise<void> {
    const file = path.join(getServerStoragePaths(server.id).dataDir, 'b3', 'control.json');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(file, `${JSON.stringify({ action, id }, null, 2)}\n`, 'utf8');
}

router.post('/servers/:id/b3/:action(start|stop|restart)', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        if (!(await findB3Config(server.id))) throw Object.assign(new Error('B3 is not installed on this server.'), { statusCode: 409 });
        await writeB3Control(server, req.params.action);
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error, 'Could not send the request to B3');
    }
});

// plugins: <plugin name="..." config="..."/> lines in b3.xml; off = the same line inside <!-- -->
const PLUGIN_LINE = /^(\s*)(<!--\s*)?(<plugin\s+name="([A-Za-z0-9_]+)"[^>]*\/>)(\s*-->)?\s*$/;

router.get('/servers/:id/b3/plugins', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const file = await findB3Config(server.id);
        if (!file || !file.endsWith('.xml')) throw Object.assign(new Error('B3 with a b3.xml is not installed on this server.'), { statusCode: 409 });
        const plugins = (await fs.readFile(file, 'utf8'))
            .split('\n')
            .map((line) => PLUGIN_LINE.exec(line))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => ({ name: m[4], enabled: !m[2], config: /config="([^"]*)"/.exec(m[3])?.[1] ?? null }));
        const extDir = path.join(path.dirname(path.dirname(file)), 'extplugins');
        const extplugins = (await fs.readdir(extDir).catch(() => [] as string[]))
            .filter((n) => n.endsWith('.py') && n !== '__init__.py')
            .map((n) => n.replace(/\.py$/, ''))
            .sort();
        return res.json({ config: path.relative(getServerStoragePaths(server.id).dataDir, file), plugins, extplugins });
    } catch (error) {
        return fail(res, error, 'Could not read the B3 plugins');
    }
});

router.post('/servers/:id/b3/plugins/:name', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const file = await findB3Config(server.id);
        if (!file || !file.endsWith('.xml')) throw Object.assign(new Error('B3 with a b3.xml is not installed on this server.'), { statusCode: 409 });
        const enabled = Boolean(req.body?.enabled);
        let found = false;
        const lines = (await fs.readFile(file, 'utf8')).split('\n').map((line) => {
            const m = PLUGIN_LINE.exec(line);
            if (!m || m[4] !== req.params.name) return line;
            found = true;
            return enabled ? `${m[1]}${m[3]}` : `${m[1]}<!-- ${m[3]} -->`;
        });
        if (!found) throw Object.assign(new Error('Plugin not found in b3.xml'), { statusCode: 404 });
        await fs.writeFile(`${file}.tmp`, lines.join('\n'), 'utf8');
        await fs.rename(`${file}.tmp`, file);
        if (req.body?.restart) await writeB3Control(server, 'restart');
        res.locals.activityDetail = `B3 plugin ${req.params.name} ${enabled ? 'on' : 'off'}`;
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error, 'Could not change the plugin');
    }
});

// admins: B3 groups and the players that have one (or match a search)
const SEARCH = /^[A-Za-z0-9 _.\-\[\]|]{0,32}$/;

router.get('/servers/:id/b3/clients', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const search = String(req.query.search ?? '').trim();
        if (!SEARCH.test(search)) throw badRequest('Search: letters, numbers, space and _ . - [ ] | only');
        const groups = await b3Query(server.id, 'SELECT id, name, keyword, level FROM `groups` ORDER BY level');
        const where = search ? `name LIKE '%${search.replace(/[%_\\']/g, (c) => `\\${c}`)}%'` : 'group_bits > 0';
        const clients = await b3Query(
            server.id,
            `SELECT id, name, guid, group_bits, connections, FROM_UNIXTIME(time_edit) AS last_seen FROM clients WHERE ${where} ORDER BY group_bits DESC, time_edit DESC LIMIT 100`
        );
        return res.json({ groups, clients });
    } catch (error) {
        return fail(res, error, 'Could not read the B3 players');
    }
});

router.put('/servers/:id/b3/clients/:clientId/group', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const clientId = Number(req.params.clientId);
        const groupId = Number(req.body?.groupId);
        if (!Number.isInteger(clientId) || clientId < 1) throw badRequest('Invalid player');
        if (!Number.isInteger(groupId) || groupId < 0) throw badRequest('Invalid group');
        const groups = await b3Query(server.id, `SELECT id FROM \`groups\` WHERE id = ${groupId}`);
        if (groupId !== 0 && groups.length === 0) throw badRequest('Unknown group');
        await b3Query(server.id, `UPDATE clients SET group_bits = ${groupId} WHERE id = ${clientId}`);
        res.locals.activityDetail = `B3 player ${clientId} group ${groupId}`;
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error, 'Could not change the group');
    }
});

router.get('/servers/:id/b3/bans', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const bans = await b3Query(
            server.id,
            "SELECT p.id, p.type, p.reason, FROM_UNIXTIME(p.time_add) AS added, IF(p.time_expire <= 0, '', FROM_UNIXTIME(p.time_expire)) AS expires, " +
                "c.name AS player, c.guid, a.name AS admin FROM penalties p JOIN clients c ON c.id = p.client_id LEFT JOIN clients a ON a.id = p.admin_id " +
                "WHERE p.type IN ('Ban', 'TempBan') AND p.inactive = 0 AND (p.time_expire <= 0 OR p.time_expire > UNIX_TIMESTAMP()) " +
                'ORDER BY p.time_add DESC LIMIT 200'
        );
        return res.json({ bans });
    } catch (error) {
        return fail(res, error, 'Could not read the bans');
    }
});

router.post('/servers/:id/b3/bans/:banId/unban', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const banId = Number(req.params.banId);
        if (!Number.isInteger(banId) || banId < 1) throw badRequest('Invalid ban');
        await b3Query(server.id, `UPDATE penalties SET inactive = 1 WHERE id = ${banId}`);
        res.locals.activityDetail = `B3 unban ${banId}`;
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error, 'Could not lift the ban');
    }
});

router.post('/servers/:id/b3/backup', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        return res.json(await backupB3Database(server.id));
    } catch (error) {
        return fail(res, error, 'Backup failed');
    }
});

router.get('/servers/:id/b3/backups', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const dir = path.join(getServerStoragePaths(server.id).dataDir, 'b3-backups');
        const files = [];
        for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
            if (!name.endsWith('.sql')) continue;
            const st = await fs.stat(path.join(dir, name)).catch(() => null);
            if (st) files.push({ file: `b3-backups/${name}`, size: st.size, time: st.mtimeMs });
        }
        return res.json({ backups: files.sort((a, b) => b.time - a.time) });
    } catch (error) {
        return fail(res, error, 'Could not list the backups');
    }
});

// restore: B3 stopped first (it keeps writing), the database replaced from the .sql file, B3 started again
router.post('/servers/:id/b3/restore', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const file = String(req.body?.file ?? '');
        const wasRunning = (await b3Info(getServerStoragePaths(server.id).dataDir))?.state === 'running';
        if (wasRunning) {
            await writeB3Control(server, 'stop');
            await new Promise((resolve) => setTimeout(resolve, 4000));
        }
        try {
            await restoreB3Database(server.id, file);
        } finally {
            if (wasRunning) await writeB3Control(server, 'start');
        }
        res.locals.activityDetail = `B3 restore ${file}`;
        return res.json({ success: true, restarted: wasRunning });
    } catch (error) {
        return fail(res, error, 'Restore failed');
    }
});

// a plugin added from the Admin page: <name>.py into extplugins (and its config into extplugins/conf), optionally
// turned on in b3.xml
const PLUGIN_NAME = /^[a-z][a-z0-9_]{0,40}$/;

async function b3Dirs(server: GameServerRow) {
    const file = await findB3Config(server.id);
    if (!file || !file.endsWith('.xml')) throw Object.assign(new Error('B3 with a b3.xml is not installed on this server.'), { statusCode: 409 });
    const b3Root = path.dirname(path.dirname(file));
    return { file, extDir: path.join(b3Root, 'extplugins') };
}

async function addPluginLine(file: string, name: string, config: string | null): Promise<boolean> {
    const content = await fs.readFile(file, 'utf8');
    if (content.split('\n').some((line) => PLUGIN_LINE.exec(line)?.[4] === name)) return false;
    const closing = content.lastIndexOf('</plugins>');
    if (closing < 0) throw Object.assign(new Error('b3.xml has no <plugins> section'), { statusCode: 409 });
    const lineStart = content.lastIndexOf('\n', closing) + 1;
    const indent = `${content.slice(lineStart, closing).match(/^\s*/)?.[0] ?? ''}    `;
    const tag = config ? `<plugin name="${name}" config="${config}"/>` : `<plugin name="${name}"/>`;
    const next = `${content.slice(0, lineStart)}${indent}${tag}\n${content.slice(lineStart)}`;
    await fs.writeFile(`${file}.tmp`, next, 'utf8');
    await fs.rename(`${file}.tmp`, file);
    return true;
}

router.post('/servers/:id/b3/plugins-upload', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const { file, extDir } = await b3Dirs(server);
        const name = String(req.body?.name ?? '').trim().toLowerCase();
        if (!PLUGIN_NAME.test(name) || name === '__init__') throw badRequest('Plugin name: small letters, numbers and _ (the .py file name)');
        const code = String(req.body?.code ?? '');
        if (!code.trim() || code.length > 2_000_000) throw badRequest('The .py file is empty or too big');
        const configText = typeof req.body?.config === 'string' ? req.body.config : '';
        const configName = String(req.body?.configName ?? '').trim();
        if (configText && !/^[A-Za-z0-9_.-]{1,64}\.(ini|xml)$/.test(configName)) throw badRequest('Config file: a .ini or .xml name');
        await fs.mkdir(extDir, { recursive: true });
        await fs.writeFile(path.join(extDir, `${name}.py`), code, 'utf8');
        let config: string | null = null;
        if (configText) {
            await fs.mkdir(path.join(extDir, 'conf'), { recursive: true });
            await fs.writeFile(path.join(extDir, 'conf', configName), configText, 'utf8');
            config = `@b3/extplugins/conf/${configName}`;
        }
        const added = req.body?.enable ? await addPluginLine(file, name, config) : false;
        if (req.body?.restart) await writeB3Control(server, 'restart');
        res.locals.activityDetail = `B3 plugin ${name} uploaded${added ? ' and added to b3.xml' : ''}`;
        return res.json({ success: true, added });
    } catch (error) {
        return fail(res, error, 'Could not upload the plugin');
    }
});

// a plugin from extplugins that is not in b3.xml yet
router.post('/servers/:id/b3/plugins/:name/add', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const { file, extDir } = await b3Dirs(server);
        const name = req.params.name;
        if (!PLUGIN_NAME.test(name)) throw badRequest('Invalid plugin name');
        if (!(await exists(path.join(extDir, `${name}.py`)))) throw Object.assign(new Error(`extplugins/${name}.py not found`), { statusCode: 404 });
        let config: string | null = null;
        for (const candidate of [`plugin_${name}.ini`, `${name}.ini`, `plugin_${name}.xml`, `${name}.xml`]) {
            if (await exists(path.join(extDir, 'conf', candidate))) {
                config = `@b3/extplugins/conf/${candidate}`;
                break;
            }
        }
        if (!(await addPluginLine(file, name, config))) throw Object.assign(new Error('The plugin is already in b3.xml'), { statusCode: 409 });
        if (req.body?.restart) await writeB3Control(server, 'restart');
        res.locals.activityDetail = `B3 plugin ${name} added to b3.xml`;
        return res.json({ success: true, config });
    } catch (error) {
        return fail(res, error, 'Could not add the plugin');
    }
});

// ---- server.cfg (main/cod4server.cfg: what +exec loads at start)
const serverCfgPath = (server: GameServerRow) => path.join(serverfiles(server), 'main', 'cod4server.cfg');

router.get('/servers/:id/servercfg', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const content = await fs.readFile(serverCfgPath(server), 'utf8').catch(() => null);
        return res.json({ file: 'serverfiles/main/cod4server.cfg', exists: content !== null, content: content ?? '' });
    } catch (error) {
        return fail(res, error, 'Could not read server.cfg');
    }
});

router.put('/servers/:id/servercfg', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const content = String(req.body?.content ?? '');
        if (content.length > 200_000) throw badRequest('The config is too long');
        const file = serverCfgPath(server);
        await fs.mkdir(path.dirname(file), { recursive: true });
        // a new file: the config may be a hard link shared with the cod4-linux folder
        await fs.writeFile(`${file}.tmp`, content, 'utf8');
        await fs.rename(`${file}.tmp`, file);
        res.locals.activityDetail = 'server.cfg saved';
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error, 'Could not save server.cfg');
    }
});

// ---- backups (configs + B3 database), automatic backups and defaults for new servers
router.get('/settings', async (_req: AuthenticatedRequest, res: Response) => {
    try {
        return res.json(await readAdminSettings());
    } catch (error) {
        return fail(res, error, 'Could not read the settings');
    }
});

router.put('/settings', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        // lastRun is the scheduler's own
        const patch = { cod4Defaults: body.cod4Defaults, autoBackup: body.autoBackup ? { ...(body.autoBackup as object), lastRun: undefined } : undefined };
        return res.json(await writeAdminSettings(patch));
    } catch (error) {
        return fail(res, error, 'Could not save the settings');
    }
});

router.get('/servers/:id/backups', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        return res.json({ backups: await listBackups(server.id), b3: Boolean(await findB3Config(server.id)) });
    } catch (error) {
        return fail(res, error, 'Could not list the backups');
    }
});

router.post('/servers/:id/backups/configs', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        return res.json(await backupServerConfigs(server.id));
    } catch (error) {
        return fail(res, error, 'Backup failed');
    }
});

router.delete('/servers/:id/backups', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const rel = String(req.query.path ?? '');
        await deleteBackup(server.id, rel);
        res.locals.activityDetail = `deleted backup ${rel}`;
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error, 'Could not delete the backup');
    }
});

// a config backup back in place (the files that are in it)
router.post('/servers/:id/backups/configs/restore', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const server = await cod4Server(req.params.id);
        const rel = String(req.body?.path ?? '');
        if (!/^config-backups\/[0-9-]+$/.test(rel)) throw badRequest('Invalid backup');
        const dataDir = getServerStoragePaths(server.id).dataDir;
        const from = path.join(dataDir, rel);
        const b3Config = await findB3Config(server.id);
        const targets: Array<[string, string | null]> = [
            ['config-lgsm', path.join(dataDir, 'config-lgsm', 'cod4server')],
            ['main', path.join(dataDir, 'serverfiles', 'main')],
            ['b3-conf', b3Config ? path.dirname(b3Config) : null],
        ];
        let files = 0;
        for (const [sub, to] of targets) {
            if (!to) continue;
            for (const entry of await fs.readdir(path.join(from, sub), { withFileTypes: true }).catch(() => [])) {
                if (!entry.isFile()) continue;
                await fs.mkdir(to, { recursive: true });
                await fs.copyFile(path.join(from, sub, entry.name), path.join(to, `${entry.name}.tmp`));
                await fs.rename(path.join(to, `${entry.name}.tmp`), path.join(to, entry.name));
                files++;
            }
        }
        res.locals.activityDetail = `restored ${rel}`;
        return res.json({ success: true, files });
    } catch (error) {
        return fail(res, error, 'Restore failed');
    }
});

router.post('/backups/run-now', async (_req: AuthenticatedRequest, res: Response) => {
    try {
        return res.json(await runAutoBackup());
    } catch (error) {
        return fail(res, error, 'Backup failed');
    }
});

// every CoD4 server's B3 database, and phpMyAdmin when one runs next to the panel
async function findPhpMyAdmin(): Promise<{ url: string | null; container: string } | null> {
    const list = await docker.listContainers().catch(() => []);
    const pma = list.find((c) => /phpmyadmin/i.test(c.Image) || (c.Names ?? []).some((n) => /pma|phpmyadmin/i.test(n)));
    if (!pma) return null;
    const container = (pma.Names?.[0] ?? '').replace(/^\//, '');
    const labels = pma.Labels ?? {};
    for (const [key, value] of Object.entries(labels)) {
        if (!/^traefik\.http\.routers\..+\.rule$/.test(key)) continue;
        const host = /Host\(`([^`]+)`\)/.exec(value)?.[1] ?? getConfig().domain;
        const prefix = /PathPrefix\(`([^`]+)`\)/.exec(value)?.[1] ?? '/';
        return { url: `https://${host}${prefix.endsWith('/') ? prefix : `${prefix}/`}`, container };
    }
    const port = pma.Ports?.find((p) => p.PublicPort)?.PublicPort;
    return { url: port ? `http://${getConfig().domain}:${port}/` : null, container };
}

router.get('/databases', async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const servers = (await serverRepository.listAll()).filter((s) => s.catalog_id === 'cod4');
        const dbRunning = await docker
            .getContainer('gamepanel-b3-db')
            .inspect()
            .then((c) => Boolean(c.State?.Running))
            .catch(() => false);
        const databases = await Promise.all(
            servers.map(async (server) => {
                if (!(await findB3Config(server.id))) return { serverId: server.id, serverName: server.name, database: null, user: null, size: null, error: null };
                try {
                    const db = await readB3Database(server.id);
                    const size = dbRunning ? await b3DatabaseSize(server.id).catch(() => null) : null;
                    return { serverId: server.id, serverName: server.name, database: db.database, user: db.user, size, error: null };
                } catch (error) {
                    return { serverId: server.id, serverName: server.name, database: null, user: null, size: null, error: error instanceof Error ? error.message : String(error) };
                }
            })
        );
        return res.json({ dbRunning, phpMyAdmin: await findPhpMyAdmin(), databases });
    } catch (error) {
        return fail(res, error, 'Could not list the databases');
    }
});

// ---- the cod4-linux folder (game files new servers get): status, and filling it from one of the servers
type RefreshState = { running: boolean; serverId: number | null; startedAt: number | null; finishedAt: number | null; linked: number; copied: number; error: string | null };
const refresh: RefreshState = { running: false, serverId: null, startedAt: null, finishedAt: null, linked: 0, copied: 0, error: null };

async function isProgram(file: string): Promise<boolean> {
    const handle = await fs.open(file, 'r');
    try {
        const buffer = Buffer.alloc(4);
        await handle.read(buffer, 0, 4, 0);
        return buffer.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    } finally {
        await handle.close();
    }
}

// like "bash gp-cod4-linux.sh <server>": big game files hard-linked, programs and small files copied, no logs
async function fillFrom(src: string, dst: string, top = true): Promise<void> {
    await fs.mkdir(dst, { recursive: true });
    for (const entry of await fs.readdir(src, { withFileTypes: true })) {
        if (top && entry.name === 'Logs') continue;
        const a = path.join(src, entry.name);
        const b = path.join(dst, entry.name);
        if (entry.isSymbolicLink()) {
            await fs.symlink(await fs.readlink(a), b);
        } else if (entry.isDirectory()) {
            await fillFrom(a, b, false);
        } else if (entry.isFile()) {
            const lower = entry.name.toLowerCase();
            if (lower.endsWith('.log') || lower.includes('.log.')) continue;
            const st = await fs.stat(a);
            if (st.size >= 1024 * 1024 && !(await isProgram(a))) {
                try {
                    await fs.link(a, b);
                    refresh.linked++;
                    continue;
                } catch {
                    // another disk: copy
                }
            }
            await fs.copyFile(a, b);
            await fs.chmod(b, st.mode & 0o7777);
            refresh.copied++;
        }
    }
}

async function folderSummary(dir: string) {
    const count = async (sub: string, pattern?: RegExp) =>
        (await fs.readdir(path.join(dir, sub)).catch(() => [] as string[])).filter((n) => !pattern || pattern.test(n)).length;
    const dedrun = await fs.stat(path.join(dir, 'cod4x18_dedrun')).catch(() => null);
    return {
        iwd: await count('main', /\.iwd$/i),
        zone: await count('zone'),
        mods: await count('mods'),
        usermaps: await count('usermaps'),
        dedrunTime: dedrun ? dedrun.mtimeMs : null,
    };
}

router.get('/cod4-files', async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const dir = cod4FilesDir();
        const status = await checkCod4Files();
        const servers = (await serverRepository.listAll())
            .filter((s) => s.catalog_id === 'cod4')
            .map((s) => ({ id: s.id, name: s.name }));
        const size = (await folderSizes((await serverRepository.listAll()).map((r) => r.id)).catch(() => null))?.['cod4-linux'] ?? null;
        return res.json({ ...status, hostFolder: cod4FilesHostDir(), summary: await folderSummary(dir), size, servers, refresh });
    } catch (error) {
        return fail(res, error, 'Could not check the cod4-linux folder');
    }
});

router.post('/cod4-files/refresh', async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (refresh.running) throw Object.assign(new Error('Already filling the folder'), { statusCode: 409 });
        const server = await cod4Server(req.body?.serverId);
        const src = serverfiles(server);
        if (!(await exists(path.join(src, 'cod4x18_dedrun')))) {
            throw Object.assign(new Error(`${server.name} has no CoD4X files (serverfiles/cod4x18_dedrun)`), { statusCode: 409 });
        }
        const dir = cod4FilesDir();
        Object.assign(refresh, { running: true, serverId: server.id, startedAt: Date.now(), finishedAt: null, linked: 0, copied: 0, error: null });
        res.locals.activityDetail = `cod4-linux filled from server ${server.id}`;
        res.json({ started: true });
        // in the background: a few GB copied (when the server is on another disk) takes a while
        void (async () => {
            try {
                await fs.rm(`${dir}.new`, { recursive: true, force: true });
                await fs.rm(`${dir}.old`, { recursive: true, force: true });
                await fillFrom(src, `${dir}.new`);
                // servers installed earlier keep their files (hard links), only the folder's own entries go
                await fs.rename(dir, `${dir}.old`).catch(() => undefined);
                await fs.rename(`${dir}.new`, dir);
                await fs.rm(`${dir}.old`, { recursive: true, force: true });
                sizeCache = null;
            } catch (error) {
                refresh.error = error instanceof Error ? error.message : String(error);
                await fs.rm(`${dir}.new`, { recursive: true, force: true }).catch(() => undefined);
            } finally {
                refresh.running = false;
                refresh.finishedAt = Date.now();
            }
        })();
        return undefined;
    } catch (error) {
        return fail(res, error, 'Could not fill the folder');
    }
});

// ---- panel look (default theme for new visitors, login page footer); the name is set from the sidebar
router.put('/appearance', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        if ('defaultTheme' in body) patch.defaultTheme = body.defaultTheme;
        if ('loginFooter' in body) patch.loginFooter = body.loginFooter;
        return res.json(await writeBranding(patch));
    } catch (error) {
        return fail(res, error, 'Could not save the look');
    }
});

// ---- activity log
router.get('/activity', async (req: AuthenticatedRequest, res: Response) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
    return res.json({ entries: await readActivity(limit) });
});

export default router;
