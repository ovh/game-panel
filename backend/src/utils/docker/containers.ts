import { docker } from './client.js';
import { randomUUID } from 'node:crypto';
import { logInfo } from '../logger.js';
import type { NormalizedPorts } from '../ports.js';
import type { ServerMountPath } from '../storage.js';
import type { NormalizedHealthcheck } from '../healthcheck.js';
import type { NormalizedResourceLimits } from '../resourceLimits.js';
import { resourceLimitsToDockerHostConfig, resourceLimitsToDockerUpdatePayload } from '../resourceLimits.js';
import type { ServerProvider } from '../../providers/types.js';
import { PassThrough, type Readable } from 'stream';
import type { ContainerStatus, HealthStatus } from '../../types/gameServer.js';

interface ContainerInfo {
    id: string;
    name: string;
    status: string;
    healthcheckDefined: boolean;
}

export type ContainerHealthStatus = Extract<HealthStatus, 'healthy' | 'unhealthy' | 'starting'>;

export interface ContainerRuntimeState {
    containerStatus: ContainerStatus;
    healthStatus: HealthStatus;
}

export type ContainerRuntimeSpec = {
    provider: ServerProvider;
    catalogId: string | null;
    image: string;
    env?: string[];
    labels?: Record<string, string>;
    mounts: ServerMountPath[];
    ports: NormalizedPorts;
    healthcheck: NormalizedHealthcheck | null;
    resourceLimits?: NormalizedResourceLimits;
    restartPolicy?: 'no' | 'unless-stopped';
    start?: boolean;
};

export type OneShotContainerSpec = {
    image: string;
    namePrefix: string;
    cmd: string[];
    env?: string[];
    mounts: ServerMountPath[];
    user?: string;
    workdir?: string;
    labels?: Record<string, string>;
};

export type PublishedHostPort = {
    protocol: 'tcp' | 'udp';
    hostPort: number;
    containerId: string;
    containerName: string;
    labels: Record<string, string>;
};

function sanitizeContainerName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/g, '-')
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

export function buildManagedContainerName(serverId: number, name: string): string {
    const slug = sanitizeContainerName(name) || 'server';
    return `${slug}-${serverId}`;
}

function buildPortMaps(ports: NormalizedPorts): {
    exposedPorts: Record<string, {}>;
    portBindings: Record<string, Array<{ HostPort: string }>>;
} {
    const exposedPorts: Record<string, {}> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};

    for (const m of ports.tcp) {
        const key = `${m.container}/tcp`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: String(m.host) }];
    }

    for (const m of ports.udp) {
        const key = `${m.container}/udp`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: String(m.host) }];
    }

    return { exposedPorts, portBindings };
}

function escapeRegexLiteral(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ns(seconds: number): number {
    return seconds * 1_000_000_000;
}

function normalizeContainerStatus(value: unknown): ContainerStatus {
    switch (value) {
        case 'created':
        case 'running':
        case 'paused':
        case 'restarting':
        case 'removing':
        case 'exited':
        case 'dead':
            return value;
        default:
            return 'unknown';
    }
}

function normalizeHealthStatus(value: unknown): HealthStatus {
    switch (value) {
        case 'starting':
        case 'healthy':
        case 'unhealthy':
            return value;
        case undefined:
        case null:
            return 'none';
        default:
            return 'unknown';
    }
}

export async function pullImageByName(image: string): Promise<void> {
    logInfo('DOCKER', `Pulling image: ${image}`);

    await new Promise<void>((resolve, reject) => {
        docker.pull(image, (err: Error | null, stream: Readable | undefined) => {
            if (err) return reject(err);
            if (!stream) return reject(new Error('Docker pull returned no stream'));

            (docker as any).modem.followProgress(
                stream,
                (e: unknown) => (e ? reject(e) : resolve())
            );
        });
    });
}

async function imageHasHealthcheck(image: string): Promise<boolean> {
    try {
        const imageInspect = await docker.getImage(image).inspect();
        const test = imageInspect?.Config?.Healthcheck?.Test;
        return Array.isArray(test) && test.length > 0 && test[0] !== 'NONE';
    } catch {
        return false;
    }
}

export async function imageExists(image: string): Promise<boolean> {
    try {
        await docker.getImage(image).inspect();
        return true;
    } catch {
        return false;
    }
}

function buildDockerHealthcheck(hc: NormalizedHealthcheck | null): any | undefined {
    if (!hc) return undefined;

    if (hc.mode === 'disabled') {
        return { Test: ['NONE'] };
    }

    const base = {
        Interval: ns(hc.intervalSeconds),
        Timeout: ns(hc.timeoutSeconds),
        StartPeriod: ns(hc.startPeriodSeconds),
        Retries: hc.retries,
    };

    if (hc.probe.type === 'tcp_connect') {
        return {
            Test: ['CMD-SHELL', `timeout ${hc.timeoutSeconds} bash -lc '</dev/tcp/127.0.0.1/${hc.probe.port}'`],
            ...base,
        };
    }

    if (hc.probe.type === 'process') {
        const safeLiteral = hc.probe.name.replace(/"/g, '\\"');
        const escaped = escapeRegexLiteral(safeLiteral);
        const pattern = `[${escaped[0]}]${escaped.slice(1)}`;
        return {
            Test: ['CMD-SHELL', `pgrep -f "${pattern}" >/dev/null || exit 1`],
            ...base,
        };
    }

    return {
        Test: ['CMD', ...hc.probe.command],
        ...base,
    };
}
function buildBinds(mounts: ServerMountPath[]): string[] {
    return mounts.map((mount) => `${mount.hostPath}:${mount.containerPath}`);
}

export async function createContainer(
    spec: ContainerRuntimeSpec,
    serverId: number,
    name: string
): Promise<ContainerInfo> {
    const safeName = sanitizeContainerName(name);
    const { exposedPorts, portBindings } = buildPortMaps(spec.ports);
    const healthcheck = buildDockerHealthcheck(spec.healthcheck);
    const healthcheckDefined = healthcheck
        ? healthcheck.Test?.[0] !== 'NONE'
        : await imageHasHealthcheck(spec.image);

    logInfo('DOCKER', `Creating container ${safeName} (provider=${spec.provider}, image=${spec.image})`);

    const container = await docker.createContainer({
        Image: spec.image,
        name: safeName,
        Hostname: safeName,
        Env: [
            `GAMEPANEL_PROVIDER=${spec.provider}`,
            ...(spec.catalogId ? [`GAMEPANEL_CATALOG_ID=${spec.catalogId}`] : []),
            ...(spec.env ?? []),
        ],
        Labels: {
            'gamepanel.serverId': String(serverId),
            'gamepanel.provider': spec.provider,
            'gamepanel.managed': 'true',
            ...(spec.catalogId ? { 'gamepanel.catalogId': spec.catalogId } : {}),
            ...(spec.labels ?? {}),
        },
        ExposedPorts: exposedPorts,
        ...(healthcheck ? { Healthcheck: healthcheck } : {}),
        HostConfig: {
            PortBindings: portBindings,
            RestartPolicy: { Name: spec.restartPolicy ?? 'unless-stopped' },
            Binds: buildBinds(spec.mounts),
            ...resourceLimitsToDockerHostConfig(spec.resourceLimits ?? null),
        },
    });

    const shouldStart = spec.start !== false;
    if (shouldStart) {
        try {
            await container.start();
        } catch (error) {
            try {
                await container.remove({ force: true });
            } catch {
                // If Docker failed during start, remove is best-effort only.
            }
            throw error;
        }
    }

    return {
        id: container.id,
        name: safeName,
        status: shouldStart ? 'running' : 'created',
        healthcheckDefined,
    };
}

export async function runOneShotContainer(
    spec: OneShotContainerSpec
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const safeName = sanitizeContainerName(`${spec.namePrefix}-${randomUUID().slice(0, 8)}`);

    const container = await docker.createContainer({
        Image: spec.image,
        name: safeName,
        Cmd: spec.cmd,
        Env: spec.env ?? [],
        User: spec.user,
        WorkingDir: spec.workdir,
        AttachStdout: true,
        AttachStderr: true,
        Labels: {
            'gamepanel.managed': 'true',
            'gamepanel.oneshot': 'true',
            ...(spec.labels ?? {}),
        },
        HostConfig: {
            Binds: buildBinds(spec.mounts),
            AutoRemove: false,
        },
    });

    try {
        const stream = (await container.attach({
            stream: true,
            stdout: true,
            stderr: true,
        })) as unknown as NodeJS.ReadableStream;

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        const stdout = new PassThrough();
        const stderr = new PassThrough();

        (docker as any).modem.demuxStream(stream, stdout, stderr);

        stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
        stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

        const streamEnded = new Promise<void>((resolve, reject) => {
            stream.on('end', resolve);
            stream.on('error', reject);
        });

        await container.start();
        const result = await container.wait();
        await streamEnded.catch(() => undefined);

        return {
            exitCode: Number(result.StatusCode ?? -1),
            stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
            stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        };
    } finally {
        try {
            await container.remove({ force: true });
        } catch {
            // Best effort cleanup for short-lived maintenance containers.
        }
    }
}

export async function startContainer(containerId: string): Promise<void> {
    await docker.getContainer(containerId).start();
}

export async function stopContainer(containerId: string, timeoutSeconds = 30): Promise<void> {
    await docker.getContainer(containerId).stop({ t: timeoutSeconds });
}

export async function restartContainer(containerId: string, timeoutSeconds = 30): Promise<void> {
    await docker.getContainer(containerId).restart({ t: timeoutSeconds });
}

export async function updateContainerResourceLimits(
    containerId: string,
    limits: NormalizedResourceLimits
): Promise<void> {
    await docker.getContainer(containerId).update(resourceLimitsToDockerUpdatePayload(limits));
}

export async function removeContainer(containerId: string): Promise<void> {
    const c = docker.getContainer(containerId);

    try {
        await c.stop({ t: 5 });
    } catch {
        // Ignore stop errors and force removal below.
    }

    await c.remove({ force: true });
}

export async function removeManagedContainersForServer(serverId: number): Promise<void> {
    const containers = await docker.listContainers({
        all: true,
        filters: {
            label: [
                'gamepanel.managed=true',
                `gamepanel.serverId=${serverId}`,
            ],
        } as any,
    });

    await Promise.all(
        containers.map(async (container) => {
            try {
                await removeContainer(container.Id);
            } catch {
                // Deletion flow is best-effort; callers still remove DB/data.
            }
        })
    );
}

export async function listPublishedHostPorts(params?: {
    excludeContainerIds?: string[];
    excludeServerIds?: number[];
}): Promise<PublishedHostPort[]> {
    const excludedContainerIds = new Set(params?.excludeContainerIds ?? []);
    const excludedServerIds = new Set((params?.excludeServerIds ?? []).map(String));
    const containers = await docker.listContainers({ all: true });
    const published: PublishedHostPort[] = [];

    await Promise.all(
        containers.map(async (containerSummary) => {
            if (excludedContainerIds.has(containerSummary.Id)) return;

            let info: any;
            try {
                info = await docker.getContainer(containerSummary.Id).inspect();
            } catch {
                return;
            }

            const labels = (info?.Config?.Labels ?? {}) as Record<string, string>;
            if (excludedServerIds.has(String(labels['gamepanel.serverId'] ?? ''))) return;

            const bindings = info?.HostConfig?.PortBindings;
            if (!bindings || typeof bindings !== 'object') return;

            const containerName = String(info?.Name ?? containerSummary.Names?.[0] ?? containerSummary.Id).replace(/^\//, '');

            for (const [containerPort, hostBindings] of Object.entries(bindings)) {
                const [, rawProtocol] = containerPort.split('/');
                if (rawProtocol !== 'tcp' && rawProtocol !== 'udp') continue;
                if (!Array.isArray(hostBindings)) continue;

                for (const binding of hostBindings) {
                    const hostPort = Number.parseInt(String((binding as any)?.HostPort ?? ''), 10);
                    if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535) continue;

                    published.push({
                        protocol: rawProtocol,
                        hostPort,
                        containerId: containerSummary.Id,
                        containerName,
                        labels,
                    });
                }
            }
        })
    );

    return published;
}

export async function checkContainerStatus(containerId: string): Promise<string> {
    const info = await docker.getContainer(containerId).inspect();
    return info.State.Status;
}

export async function inspectContainerRuntime(containerId: string): Promise<ContainerRuntimeState> {
    const info = await docker.getContainer(containerId).inspect();
    return {
        containerStatus: normalizeContainerStatus(info?.State?.Status),
        healthStatus: normalizeHealthStatus(info?.State?.Health?.Status),
    };
}
