import os from 'os';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logError } from './logger.js';

const execFileAsync = promisify(execFile);

type CpuSample = { idle: number; total: number; timestamp: number };
type NetSample = { rx: number; tx: number; timestamp: number };

let lastCpuSample: CpuSample | null = null;
let lastNetworkSample: NetSample | null = null;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Reads a CPU sample from Node's OS API (cumulative ticks since boot).
 * We then compute usage as a delta between samples to get a meaningful percentage.
 */
function readCpuSample(): CpuSample {
  const cpuStats = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpuStats) {
    const times = cpu.times;
    totalIdle += times.idle;
    totalTick += times.user + times.nice + times.sys + times.irq + times.idle;
  }

  const cores = Math.max(cpuStats.length, 1);
  return {
    idle: totalIdle / cores,
    total: totalTick / cores,
    timestamp: Date.now(),
  };
}

/**
 * Returns CPU usage percentage based on two consecutive samples.
 * First call returns 0 (no previous sample to compare).
 */
async function getCPUUsage(): Promise<number> {
  try {
    const current = readCpuSample();

    if (!lastCpuSample) {
      lastCpuSample = current;
      return 0;
    }

    const idleDelta = current.idle - lastCpuSample.idle;
    const totalDelta = current.total - lastCpuSample.total;

    lastCpuSample = current;

    if (!Number.isFinite(totalDelta) || totalDelta <= 0) return 0;

    const usage = 100 - (idleDelta / totalDelta) * 100;
    return clampPercent(Math.round(usage));
  } catch (error) {
    logError('UTIL:SYSTEM:CPU', error);
    return 0;
  }
}

/**
 * Returns memory usage percentage (used / total).
 */
async function getMemoryUsage(): Promise<number> {
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    if (!Number.isFinite(totalMemory) || totalMemory <= 0) return 0;

    return clampPercent(round2((usedMemory / totalMemory) * 100));
  } catch (error) {
    logError('UTIL:SYSTEM:MEMORY', error);
    return 0;
  }
}

/**
 * Returns disk usage percentage for the root filesystem using `df`.
 * Uses POSIX output (-P) for consistent parsing.
 */
async function getDiskUsage(): Promise<number> {
  try {
    const { stdout } = await execFileAsync('df', ['-Pk', '/']);
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return 0;

    // Filesystem 1024-blocks Used Available Capacity Mounted on
    const parts = lines[1].trim().split(/\s+/);
    const total = Number.parseInt(parts[1] ?? '', 10);
    const used = Number.parseInt(parts[2] ?? '', 10);

    if (!Number.isFinite(total) || total <= 0) return 0;
    if (!Number.isFinite(used) || used < 0) return 0;

    return clampPercent(round2((used / total) * 100));
  } catch (error) {
    logError('UTIL:SYSTEM:DISK', error);
    return 0;
  }
}

/**
 * Returns network usage as bytes per second (rx/tx) computed from /proc/net/dev deltas.
 * First call returns 0 because we need a previous sample.
 *
 * Note: This is Linux-specific. On non-Linux systems, it will return { in: 0, out: 0 }.
 */
async function getNetworkUsage(): Promise<{ in: number; out: number }> {
  try {
    // /proc/net/dev exists only on Linux
    const data = await fs.readFile('/proc/net/dev', 'utf-8');
    const lines = data.trim().split('\n').slice(2);

    let rx = 0;
    let tx = 0;

    for (const line of lines) {
      const [ifacePart, rest] = line.split(':');
      if (!ifacePart || !rest) continue;

      const iface = ifacePart.trim();
      if (!iface || iface === 'lo') continue;

      // Fields: receive bytes is index 0, transmit bytes is index 8
      const fields = rest.trim().split(/\s+/);
      const rxBytes = Number.parseInt(fields[0] ?? '', 10);
      const txBytes = Number.parseInt(fields[8] ?? '', 10);

      if (Number.isFinite(rxBytes)) rx += rxBytes;
      if (Number.isFinite(txBytes)) tx += txBytes;
    }

    const now = Date.now();

    if (!lastNetworkSample) {
      lastNetworkSample = { rx, tx, timestamp: now };
      return { in: 0, out: 0 };
    }

    const elapsedSeconds = Math.max((now - lastNetworkSample.timestamp) / 1000, 1);
    const rxRate = Math.max(0, Math.round((rx - lastNetworkSample.rx) / elapsedSeconds));
    const txRate = Math.max(0, Math.round((tx - lastNetworkSample.tx) / elapsedSeconds));

    lastNetworkSample = { rx, tx, timestamp: now };
    return { in: rxRate, out: txRate };
  } catch (error) {
    // On non-Linux environments this is expected.
    logError('UTIL:SYSTEM:NETWORK', error);
    return { in: 0, out: 0 };
  }
}

type SystemStats = {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkUsage: { in: number; out: number };
};

/**
 * Convenience helper used by both REST and WebSocket pollers.
 */
export async function getSystemStats(): Promise<SystemStats> {
  return {
    cpuUsage: await getCPUUsage(),
    memoryUsage: await getMemoryUsage(),
    diskUsage: await getDiskUsage(),
    networkUsage: await getNetworkUsage(),
  };
}
