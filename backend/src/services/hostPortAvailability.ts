import { serverRepository } from '../database/index.js';
import { parseStoredPorts } from '../providers/runtimeConfig.js';
import type { NormalizedPorts } from '../utils/ports.js';
import * as dockerUtils from '../utils/docker.js';

type Protocol = 'tcp' | 'udp';

type HostPortCheckInput = {
    ports: NormalizedPorts;
    excludeServerId?: number;
    excludeContainerIds?: string[];
};

function conflictError(message: string): Error {
    return Object.assign(new Error(message), { statusCode: 409 });
}

function requestedHostPorts(ports: NormalizedPorts): Array<{ protocol: Protocol; hostPort: number }> {
    return [
        ...ports.tcp.map((port) => ({ protocol: 'tcp' as const, hostPort: port.host })),
        ...ports.udp.map((port) => ({ protocol: 'udp' as const, hostPort: port.host })),
    ];
}

function matchesRequestedPort(
    requested: Array<{ protocol: Protocol; hostPort: number }>,
    protocol: Protocol,
    hostPort: number
): boolean {
    return requested.some((port) => port.protocol === protocol && port.hostPort === hostPort);
}

export async function assertHostPortsAvailableForServer(input: HostPortCheckInput): Promise<void> {
    const requested = requestedHostPorts(input.ports);
    if (requested.length === 0) return;

    const servers = await serverRepository.listAll();
    for (const server of servers) {
        if (server.id === input.excludeServerId) continue;

        const storedPorts = parseStoredPorts(server);
        for (const port of requestedHostPorts(storedPorts)) {
            if (!matchesRequestedPort(requested, port.protocol, port.hostPort)) continue;

            throw conflictError(
                `${port.protocol.toUpperCase()} port ${port.hostPort} is already assigned to server "${server.name}"`
            );
        }
    }

    const publishedHostPorts = await dockerUtils.listPublishedHostPorts({
        excludeContainerIds: input.excludeContainerIds,
        excludeServerIds: input.excludeServerId ? [input.excludeServerId] : [],
    });

    for (const port of publishedHostPorts) {
        if (!matchesRequestedPort(requested, port.protocol, port.hostPort)) continue;

        throw conflictError(
            `${port.protocol.toUpperCase()} port ${port.hostPort} is already published by Docker container "${port.containerName}"`
        );
    }
}
