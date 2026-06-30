import { serverRepository } from '../database/index.js';
import type { GameServerRow } from '../types/gameServer.js';

export class ServerInstallCancelledError extends Error {
    constructor(serverId: number) {
        super(`Server ${serverId} was deleted during installation`);
        this.name = 'ServerInstallCancelledError';
    }
}

function conflict(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 409 });
}

export function assertCanPatchServer(server: GameServerRow): void {
    if (server.status === 'creating') {
        conflict('Cannot patch server while it is being created');
    }
}

export function assertCanPowerServer(server: GameServerRow): void {
    if (server.status === 'creating') {
        conflict('Cannot change server power state while it is being created');
    }
}

export function assertCanReconfigureServer(server: GameServerRow): void {
    if (['creating', 'starting', 'stopping', 'restarting'].includes(server.status)) {
        conflict(`Cannot reconfigure server while status is ${server.status}`);
    }
}

export function assertCanModifyFrameworks(server: GameServerRow): void {
    if (['creating', 'installing', 'starting', 'running', 'stopping', 'restarting'].includes(server.status)) {
        conflict(`Cannot install or repair frameworks while the server is ${server.status}; stop the server first`);
    }
}

export function assertCanReconfigureContainer(containerStatus: string): void {
    if (!['running', 'created', 'restarting', 'exited', 'dead'].includes(containerStatus)) {
        conflict(`Cannot reconfigure server while container status is ${containerStatus}`);
    }
}

export function assertCanDeleteServer(_server: GameServerRow): void {
    // Delete is intentionally always allowed so users can recover from stuck installs.
}

export async function serverExists(serverId: number): Promise<boolean> {
    return Boolean(await serverRepository.findById(serverId));
}

export async function assertServerExistsDuringInstall(serverId: number): Promise<void> {
    if (!(await serverExists(serverId))) {
        throw new ServerInstallCancelledError(serverId);
    }
}
