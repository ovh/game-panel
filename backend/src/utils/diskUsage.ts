import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { getServerStoragePaths } from './storage.js';
import { logError } from './logger.js';
import { round2 } from './number.js';

const execFileAsync = promisify(execFile);

export const DISK_USAGE_SCAN_INTERVAL_MS = 2 * 60_000;

type DiskCacheEntry = {
  value: number;
  scannedAt: number;
};

const hostDiskCache = new Map<string, DiskCacheEntry>();
const serverDiskCache = new Map<number, DiskCacheEntry>();

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getFilesystemUsagePercent(targetPath: string): Promise<number> {
  const { stdout } = await execFileAsync('df', ['-Pk', targetPath]);
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) return 0;

  // Filesystem 1024-blocks Used Available Capacity Mounted on
  const parts = lines[1].trim().split(/\s+/);
  const totalKb = Number.parseInt(parts[1] ?? '', 10);
  const usedKb = Number.parseInt(parts[2] ?? '', 10);

  if (!Number.isFinite(totalKb) || totalKb <= 0) return 0;
  if (!Number.isFinite(usedKb) || usedKb < 0) return 0;

  return clampPercent(round2((usedKb / totalKb) * 100));
}

async function getFilesystemTotalBytes(targetPath: string): Promise<number> {
  const { stdout } = await execFileAsync('df', ['-Pk', targetPath]);
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) return 0;

  const parts = lines[1].trim().split(/\s+/);
  const totalKb = Number.parseInt(parts[1] ?? '', 10);

  if (!Number.isFinite(totalKb) || totalKb <= 0) return 0;
  return totalKb * 1024;
}

async function getDirectorySizeBytes(targetPath: string): Promise<number> {
  const { stdout } = await execFileAsync('du', ['-sk', targetPath]);
  const sizeKb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);

  if (!Number.isFinite(sizeKb) || sizeKb < 0) return 0;
  return sizeKb * 1024;
}

function isFresh(entry: DiskCacheEntry | undefined, ttlMs: number): boolean {
  return !!entry && Date.now() - entry.scannedAt < ttlMs;
}

export async function getCachedHostDiskUsagePercent(
  targetPath = '/',
  ttlMs = DISK_USAGE_SCAN_INTERVAL_MS
): Promise<number> {
  const cached = hostDiskCache.get(targetPath);
  if (cached && isFresh(cached, ttlMs)) return cached.value;

  try {
    const value = await getFilesystemUsagePercent(targetPath);
    hostDiskCache.set(targetPath, { value, scannedAt: Date.now() });
    return value;
  } catch (error) {
    logError('UTIL:DISK_USAGE:HOST', error);
    return cached?.value ?? 0;
  }
}

export async function getCachedServerStorageDiskUsagePercent(
  serverId: number,
  ttlMs = DISK_USAGE_SCAN_INTERVAL_MS
): Promise<number> {
  const cached = serverDiskCache.get(serverId);
  if (cached && isFresh(cached, ttlMs)) return cached.value;

  try {
    const { serverRoot } = getServerStoragePaths(serverId);
    if (!(await pathExists(serverRoot))) {
      serverDiskCache.set(serverId, { value: 0, scannedAt: Date.now() });
      return 0;
    }

    const [serverBytes, filesystemBytes] = await Promise.all([
      getDirectorySizeBytes(serverRoot),
      getFilesystemTotalBytes(serverRoot),
    ]);

    const value = filesystemBytes > 0
      ? clampPercent(round2((serverBytes / filesystemBytes) * 100))
      : 0;

    serverDiskCache.set(serverId, { value, scannedAt: Date.now() });
    return value;
  } catch (error) {
    logError('UTIL:DISK_USAGE:SERVER', error);
    return cached?.value ?? 0;
  }
}
