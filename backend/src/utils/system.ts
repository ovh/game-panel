import os from 'os';
import fs from 'fs/promises';
import { logError } from './logger.js';
import { getCachedHostDiskUsagePercent } from './diskUsage.js';
import { round2 } from './number.js';

type CpuSample = { idle: number; total: number; timestamp: number };
type NetSample = { rx: number; tx: number; timestamp: number };

let lastCpuSample: CpuSample | null = null;
let lastNetworkSample: NetSample | null = null;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

// Reads a CPU sample from Node's OS API (cumulative ticks since boot).
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

// Returns CPU usage percentage based on two consecutive samples.
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

// Returns memory usage percentage (used / total).
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

// Returns network usage as bytes per second (rx/tx) computed from /proc/net/dev deltas.
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

export async function getSystemStats(): Promise<SystemStats> {
  return {
    cpuUsage: await getCPUUsage(),
    memoryUsage: await getMemoryUsage(),
    diskUsage: await getCachedHostDiskUsagePercent('/'),
    networkUsage: await getNetworkUsage(),
  };
}
