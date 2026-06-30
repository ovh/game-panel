import os from 'os';
import { docker } from './client.js';
import { round2 } from '../number.js';

type NetworkSample = {
    rx: number;
    tx: number;
    timestamp: number;
};

const lastNetworkSamples = new Map<string, NetworkSample>();

const clampPercent = (n: number) => {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
};

export async function getContainerStats(containerId: string): Promise<{
    cpuUsage: number; // 0..100 (% host)
    memoryUsage: number; // 0..100 (% host)
    networkUsage: { in: number; out: number }; // bytes/s
}> {
    const container = docker.getContainer(containerId);
    const stats = (await container.stats({ stream: false })) as any;

    // CPU (normalized host %)
    const cpuTotal = stats.cpu_stats?.cpu_usage?.total_usage ?? 0;
    const preCpuTotal = stats.precpu_stats?.cpu_usage?.total_usage ?? 0;

    const sysTotal = stats.cpu_stats?.system_cpu_usage ?? 0;
    const preSysTotal = stats.precpu_stats?.system_cpu_usage ?? 0;

    const cpuDelta = cpuTotal - preCpuTotal;
    const systemDelta = sysTotal - preSysTotal;

    let cpuUsage = 0;
    if (systemDelta > 0 && cpuDelta > 0) {
        cpuUsage = (cpuDelta / systemDelta) * 100;
    }
    cpuUsage = round2(clampPercent(cpuUsage));

    // Memory (% of host RAM)
    const hostTotal = os.totalmem(); // bytes
    const memUsageRaw = stats.memory_stats?.usage ?? 0;

    const memStats = stats.memory_stats?.stats ?? {};
    // cgroup v1 often exposes "cache"
    // cgroup v2 often exposes "inactive_file" (good proxy to subtract file cache)
    const cacheLike =
        (typeof memStats.cache === 'number' ? memStats.cache : 0) +
        (typeof memStats.inactive_file === 'number' ? memStats.inactive_file : 0);

    const memWorkingSet = Math.max(memUsageRaw - cacheLike, 0);

    let memoryUsage = 0;
    if (Number.isFinite(hostTotal) && hostTotal > 0) {
        memoryUsage = (memWorkingSet / hostTotal) * 100;
    }
    memoryUsage = round2(clampPercent(memoryUsage));

    // Network (bytes/s)
    let rx = 0;
    let tx = 0;

    const networks = stats.networks ?? {};
    for (const networkStats of Object.values(networks) as any[]) {
        const rxBytes = Number(networkStats?.rx_bytes ?? 0);
        const txBytes = Number(networkStats?.tx_bytes ?? 0);

        if (Number.isFinite(rxBytes)) rx += rxBytes;
        if (Number.isFinite(txBytes)) tx += txBytes;
    }

    const timestamp = Date.now();
    const previousNetworkSample = lastNetworkSamples.get(containerId);
    let networkUsage = { in: 0, out: 0 };

    if (previousNetworkSample) {
        const elapsedSeconds = Math.max((timestamp - previousNetworkSample.timestamp) / 1000, 1);
        networkUsage = {
            in: Math.max(0, Math.round((rx - previousNetworkSample.rx) / elapsedSeconds)),
            out: Math.max(0, Math.round((tx - previousNetworkSample.tx) / elapsedSeconds)),
        };
    }

    lastNetworkSamples.set(containerId, { rx, tx, timestamp });

    return { cpuUsage, memoryUsage, networkUsage };
}
