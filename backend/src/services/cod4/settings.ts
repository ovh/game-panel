import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../../config.js';

// Settings of the Admin page, in the panel's data folder (admin-settings.json):
// - cod4Defaults: what a new Call of Duty 4 server gets (slots in the install form, mod, FastDL, B3, starting config)
// - autoBackup: daily backup of every CoD4 server's configs and B3 database
export type Cod4Defaults = {
    slots: number;
    mod: string;
    fastdl: boolean;
    b3: boolean;
    // main/cod4server.cfg of new servers; empty = the one from the cod4-linux folder
    serverCfg: string;
};

export type AutoBackup = {
    enabled: boolean;
    hour: number;
    keep: number;
    lastRun: number | null;
};

export type AdminSettings = { cod4Defaults: Cod4Defaults; autoBackup: AutoBackup };

const DEFAULTS: AdminSettings = {
    cod4Defaults: { slots: 32, mod: '', fastdl: true, b3: false, serverCfg: '' },
    autoBackup: { enabled: false, hour: 5, keep: 7, lastRun: null },
};

function settingsFile(): string {
    return path.join(getConfig().gamepanelDataDir, 'admin-settings.json');
}

export async function readAdminSettings(): Promise<AdminSettings> {
    try {
        const saved = JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as Partial<AdminSettings>;
        return {
            cod4Defaults: { ...DEFAULTS.cod4Defaults, ...(saved.cod4Defaults ?? {}) },
            autoBackup: { ...DEFAULTS.autoBackup, ...(saved.autoBackup ?? {}) },
        };
    } catch {
        return structuredClone(DEFAULTS);
    }
}

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { statusCode: 400 });
}

export async function writeAdminSettings(patch: unknown): Promise<AdminSettings> {
    const current = await readAdminSettings();
    const body = (patch ?? {}) as { cod4Defaults?: Partial<Cod4Defaults>; autoBackup?: Partial<AutoBackup> };
    const next: AdminSettings = {
        cod4Defaults: { ...current.cod4Defaults },
        autoBackup: { ...current.autoBackup },
    };
    const d = body.cod4Defaults;
    if (d) {
        if (d.slots !== undefined) {
            const slots = Number(d.slots);
            if (!Number.isInteger(slots) || slots < 1 || slots > 64) throw badRequest('Slots: 1 to 64');
            next.cod4Defaults.slots = slots;
        }
        if (d.mod !== undefined) {
            const mod = String(d.mod).trim();
            if (mod && !/^[A-Za-z0-9_.-]{1,64}$/.test(mod)) throw badRequest('Mod: letters, numbers, dot, dash and underscore');
            next.cod4Defaults.mod = mod;
        }
        if (d.fastdl !== undefined) next.cod4Defaults.fastdl = Boolean(d.fastdl);
        if (d.b3 !== undefined) next.cod4Defaults.b3 = Boolean(d.b3);
        if (d.serverCfg !== undefined) {
            const cfg = String(d.serverCfg);
            if (cfg.length > 200_000) throw badRequest('The config is too long');
            next.cod4Defaults.serverCfg = cfg;
        }
    }
    const b = body.autoBackup;
    if (b) {
        if (b.enabled !== undefined) next.autoBackup.enabled = Boolean(b.enabled);
        if (b.hour !== undefined) {
            const hour = Number(b.hour);
            if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw badRequest('Hour: 0 to 23');
            next.autoBackup.hour = hour;
        }
        if (b.keep !== undefined) {
            const keep = Number(b.keep);
            if (!Number.isInteger(keep) || keep < 1 || keep > 90) throw badRequest('Keep: 1 to 90 backups');
            next.autoBackup.keep = keep;
        }
        if (b.lastRun !== undefined) next.autoBackup.lastRun = b.lastRun === null ? null : Number(b.lastRun);
    }
    const file = settingsFile();
    await fs.writeFile(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await fs.rename(`${file}.tmp`, file);
    return next;
}
