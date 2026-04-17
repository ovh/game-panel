import { docker } from './client.js';
import { ensureServerDataDirs } from '../storage.js';
import type { NormalizedPortMappings } from '../ports.js';
import type { Readable } from 'stream';

interface ContainerInfo {
    id: string;
    name: string;
    status: string;
}

export type ContainerHealthStatus = 'healthy' | 'unhealthy' | 'starting';

export interface ContainerRuntimeState {
    containerStatus: string;
    healthStatus: ContainerHealthStatus | null;
}

export type HealthcheckPayload =
    | { type: 'default' }
    | { type: 'tcp_connect'; port: number }
    | { type: 'process'; name: string };

type CatalogHealthcheck =
    | { type: 'tcp_connect'; port: number }
    | { type: 'process'; name: string }
    | { type: 'default' };

export type NormalizedHealthcheck =
    | { type: 'tcp_connect'; port: number }
    | { type: 'process'; name: string };

export function normalizeHealthcheckPayload(
    payload?: HealthcheckPayload
): NormalizedHealthcheck | null {
    if (!payload || !payload.type || payload.type === 'default') {
        return null; // let image default healthcheck run
    }

    if (payload.type === 'tcp_connect') {
        const port = Number(payload.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('healthcheck.tcp_connect requires a valid port (1..65535)');
        }
        return { type: 'tcp_connect', port };
    }

    if (payload.type === 'process') {
        const name = (payload as any).name;
        if (!name || typeof name !== 'string' || !name.trim()) {
            throw new Error('healthcheck.process requires a non-empty "name"');
        }
        return { type: 'process', name: name.trim() };
    }

    throw new Error(`Unsupported healthcheck type: ${String((payload as any).type)}`);
}

type ContainerSpec = {
    gameKey: string;
    image: string;
    healthcheck: CatalogHealthcheck | null;
};

function sanitizeContainerName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
}

function buildPortMaps(mappings: NormalizedPortMappings): {
    exposedPorts: Record<string, {}>;
    portBindings: Record<string, Array<{ HostPort: string }>>;
} {
    const exposedPorts: Record<string, {}> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};

    for (const m of mappings.tcp) {
        const key = `${m.container}/tcp`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: String(m.host) }];
    }

    for (const m of mappings.udp) {
        const key = `${m.container}/udp`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: String(m.host) }];
    }

    return { exposedPorts, portBindings };
}

function escapeRegexLiteral(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function pullImageByName(image: string): Promise<void> {
    console.log(`Pulling image: ${image}`);

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

export async function createContainer(
    spec: ContainerSpec,
    serverId: number,
    name: string,
    mappings: NormalizedPortMappings
): Promise<ContainerInfo> {
    const safeName = sanitizeContainerName(name);
    const { exposedPorts, portBindings } = buildPortMaps(mappings);

    console.log(`Creating container: ${safeName}\nGame: ${spec.gameKey}\nImage: ${spec.image}`);

    const { dataDir, backupDir } = await ensureServerDataDirs(serverId);

    const ns = (seconds: number) => seconds * 1_000_000_000;

    // Keep the image-defined healthcheck when no explicit override is requested.
    const hc = spec.healthcheck;
    let healthcheck: any | undefined;

    if (hc?.type === 'tcp_connect') {
        const probePort = Number(hc.port);
        if (!Number.isInteger(probePort) || probePort < 1 || probePort > 65535) {
            throw new Error(`[createContainer] Invalid tcp_connect port: ${String(hc.port)}`);
        }

        healthcheck = {
            Test: ['CMD-SHELL', `timeout 5 bash -c '</dev/tcp/127.0.0.1/${probePort}'`],
            Interval: ns(3),
            Timeout: ns(2),
            StartPeriod: ns(480),
            Retries: 2,
        };
    } else if (hc?.type === 'process') {
        const processName = (hc as any).name;

        if (!processName || typeof processName !== 'string') {
            throw new Error(`[createContainer] healthcheck.type=process requires a process name`);
        }

        const safeLiteral = processName.replace(/"/g, '\\"');
        const escaped = escapeRegexLiteral(safeLiteral);
        const pattern = `[${escaped[0]}]${escaped.slice(1)}`;

        healthcheck = {
            Test: ['CMD-SHELL', `pgrep -f "${pattern}" >/dev/null || exit 1`],
            Interval: ns(3),
            Timeout: ns(2),
            StartPeriod: ns(480),
            Retries: 2,
        };
    } else {
        // hc null/undefined/default => keep the image-defined healthcheck when available,
        // but extend the start period to match the panel install grace window.
        const imageInspect = await docker.getImage(spec.image).inspect();
        const imageHealthcheck = imageInspect?.Config?.Healthcheck;

        if (imageHealthcheck?.Test) {
            healthcheck = {
                ...imageHealthcheck,
                StartPeriod: ns(480),
            };
        } else {
            healthcheck = undefined;
        }
    }

    const container = await docker.createContainer({
        Image: spec.image,
        name: safeName,
        Hostname: safeName,
        Env: [`GAME_KEY=${spec.gameKey}`],
        Labels: {
            'gamepanel.serverId': String(serverId),
            'gamepanel.gameKey': String(spec.gameKey),
            'gamepanel.managed': 'true',
        },
        ExposedPorts: exposedPorts,
        ...(healthcheck ? { Healthcheck: healthcheck } : {}),
        HostConfig: {
            PortBindings: portBindings,
            RestartPolicy: { Name: 'always' },
            Binds: [`${dataDir}:/data`, `${backupDir}:/app/lgsm/backup`],
        },
    });

    await container.start();
    return { id: container.id, name: safeName, status: 'running' };
}

export async function startContainer(containerId: string): Promise<void> {
    await docker.getContainer(containerId).start();
}

export async function stopContainer(containerId: string): Promise<void> {
    await docker.getContainer(containerId).stop({ t: 30 });
}

export async function restartContainer(containerId: string): Promise<void> {
    await docker.getContainer(containerId).restart({ t: 30 });
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

export async function checkContainerStatus(containerId: string): Promise<string> {
    const info = await docker.getContainer(containerId).inspect();
    return info.State.Status;
}

export async function inspectContainerRuntime(containerId: string): Promise<ContainerRuntimeState> {
    const info = await docker.getContainer(containerId).inspect();
    return {
        containerStatus: info?.State?.Status ?? 'unknown',
        healthStatus: (info?.State?.Health?.Status as ContainerHealthStatus | undefined) ?? null,
    };
}
