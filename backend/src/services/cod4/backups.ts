import fs from 'node:fs/promises';
import path from 'node:path';
import { serverRepository } from '../../database/index.js';
import { getServerStoragePaths } from '../../utils/storage.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import { backupB3Database, findB3Config } from './b3db.js';
import { readAdminSettings, writeAdminSettings } from './settings.js';

// Backups of a CoD4 server's configs (LinuxGSM config, server configs in main/, B3 configs) into its folder
// (config-backups/<time>/), and the daily automatic backup (configs + B3 database) of every CoD4 server.

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

async function copyMatching(fromDir: string, toDir: string, pattern: RegExp): Promise<number> {
    let count = 0;
    for (const entry of await fs.readdir(fromDir, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isFile() || !pattern.test(entry.name)) continue;
        await fs.mkdir(toDir, { recursive: true });
        await fs.copyFile(path.join(fromDir, entry.name), path.join(toDir, entry.name));
        count++;
    }
    return count;
}

export async function backupServerConfigs(serverId: number): Promise<{ folder: string; files: number }> {
    const dataDir = getServerStoragePaths(serverId).dataDir;
    const folder = path.posix.join('config-backups', stamp());
    const target = path.join(dataDir, folder);
    let files = 0;
    files += await copyMatching(path.join(dataDir, 'config-lgsm', 'cod4server'), path.join(target, 'config-lgsm'), /\.cfg$/);
    files += await copyMatching(path.join(dataDir, 'serverfiles', 'main'), path.join(target, 'main'), /\.cfg$/);
    const b3Config = await findB3Config(serverId);
    if (b3Config) files += await copyMatching(path.dirname(b3Config), path.join(target, 'b3-conf'), /\.(xml|ini|cfg|txt)$/);
    return { folder, files };
}

export type BackupItem = { kind: 'configs' | 'b3'; path: string; size: number; time: number };

async function dirSize(dir: string): Promise<number> {
    let size = 0;
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(dir, entry.name);
        size += entry.isDirectory() ? await dirSize(full) : (await fs.stat(full).catch(() => ({ size: 0 }))).size;
    }
    return size;
}

export async function listBackups(serverId: number): Promise<BackupItem[]> {
    const dataDir = getServerStoragePaths(serverId).dataDir;
    const items: BackupItem[] = [];
    for (const name of await fs.readdir(path.join(dataDir, 'config-backups')).catch(() => [] as string[])) {
        const full = path.join(dataDir, 'config-backups', name);
        const st = await fs.stat(full).catch(() => null);
        if (st?.isDirectory()) items.push({ kind: 'configs', path: `config-backups/${name}`, size: await dirSize(full), time: st.mtimeMs });
    }
    for (const name of await fs.readdir(path.join(dataDir, 'b3-backups')).catch(() => [] as string[])) {
        if (!name.endsWith('.sql')) continue;
        const st = await fs.stat(path.join(dataDir, 'b3-backups', name)).catch(() => null);
        if (st) items.push({ kind: 'b3', path: `b3-backups/${name}`, size: st.size, time: st.mtimeMs });
    }
    return items.sort((a, b) => b.time - a.time);
}

export async function deleteBackup(serverId: number, rel: string): Promise<void> {
    if (!/^(config-backups\/[0-9-]+|b3-backups\/[A-Za-z0-9_.-]+\.sql)$/.test(rel)) {
        throw Object.assign(new Error('Invalid backup'), { statusCode: 400 });
    }
    await fs.rm(path.join(getServerStoragePaths(serverId).dataDir, rel), { recursive: true, force: true });
}

async function prune(serverId: number, keep: number): Promise<void> {
    const items = await listBackups(serverId);
    for (const kind of ['configs', 'b3'] as const) {
        for (const old of items.filter((i) => i.kind === kind).slice(keep)) await deleteBackup(serverId, old.path).catch(() => undefined);
    }
}

export async function runAutoBackup(): Promise<{ servers: number; errors: string[] }> {
    const settings = await readAdminSettings();
    const servers = (await serverRepository.listAll()).filter((s) => s.catalog_id === 'cod4');
    const errors: string[] = [];
    for (const server of servers) {
        try {
            await backupServerConfigs(server.id);
            if (await findB3Config(server.id)) await backupB3Database(server.id);
            await prune(server.id, settings.autoBackup.keep);
        } catch (error) {
            errors.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    await writeAdminSettings({ autoBackup: { lastRun: Date.now() } });
    logInfo('ADMIN:BACKUP', `Automatic backup of ${servers.length} CoD4 server(s)${errors.length ? `, ${errors.length} error(s)` : ''}`);
    if (errors.length) logWarn('ADMIN:BACKUP', errors.join('; '));
    return { servers: servers.length, errors };
}

// once a day at the chosen hour (server time); checked every few minutes
let started = false;
export function startAutoBackupScheduler(): void {
    if (started) return;
    started = true;
    const check = async () => {
        try {
            const { autoBackup } = await readAdminSettings();
            if (!autoBackup.enabled) return;
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            if (now.getHours() === autoBackup.hour && (autoBackup.lastRun ?? 0) < today) await runAutoBackup();
        } catch (error) {
            logWarn('ADMIN:BACKUP', `Automatic backup check failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    setInterval(() => void check(), 5 * 60_000).unref();
}
