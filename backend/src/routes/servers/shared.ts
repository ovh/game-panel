import * as dockerUtils from '../../utils/docker.js';
import { serverRepository } from '../../database/index.js';
import { getServerOrThrow } from '../../services/servers.js';
import { parsePositiveIntId } from '../../utils/ids.js';
import type { GameServerRow } from '../../types/gameServer.js';
import {
    completeServerTransition,
    reconcileServerStatus,
} from '../../services/serverTransitions.js';

export function parseServerId(raw: string): number | null {
    return parsePositiveIntId(raw);
}

export function parseOptionalBoolean(value: unknown): boolean | null {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return null;
}

export { asOptionalString } from '../../providers/installPayload.js';

export function hasOwn(obj: unknown, key: string): boolean {
    return Boolean(obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key));
}

export function isValidServerName(value: string): boolean {
    return value.length >= 3 && value.length <= 50;
}

export async function completeDockerPowerTransition(serverId: number): Promise<void> {
    const server = await getServerOrThrow(serverId);
    const runtime = await dockerUtils.inspectContainerRuntime(server.docker_container_id);

    if (runtime.containerStatus !== 'running') {
        await reconcileServerStatus(serverId);
        return;
    }

    await serverRepository.updateRuntimeState(serverId, {
        containerStatus: runtime.containerStatus,
        healthStatus: runtime.healthStatus,
    });

    if (runtime.healthStatus === 'none' || runtime.healthStatus === 'healthy') {
        await completeServerTransition(serverId, 'running');
        return;
    }

    if (runtime.healthStatus === 'unhealthy' || runtime.healthStatus === 'unknown') {
        await completeServerTransition(serverId, 'unhealthy');
    }
}

export async function loadServerAfterMutation(serverId: number, action: string): Promise<GameServerRow> {
    const server = await serverRepository.findById(serverId);
    if (!server) {
        throw new Error(`${action}: server ${serverId} could not be loaded after mutation`);
    }
    return server;
}
