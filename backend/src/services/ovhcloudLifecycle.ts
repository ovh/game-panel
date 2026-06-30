import { getOvhcloudImageAdapter, getOvhcloudServerAdapter } from '../providers/ovhcloud/adapters/registry.js';
import type {
    OvhcloudImageAdapter,
    OvhcloudInstallInput,
    OvhcloudRecreateInput,
} from '../providers/ovhcloud/adapters/types.js';
import type { ResolvedInstallSpec } from '../providers/installTypes.js';
import type { GameServerRow, HealthStatus } from '../types/gameServer.js';

export const DEFAULT_DOCKER_STOP_TIMEOUT_SECONDS = 30;

function getAdapterForInstallSpec(spec: ResolvedInstallSpec): OvhcloudImageAdapter | null {
    if (spec.provider !== 'ovhcloud') return null;

    const imageId = typeof spec.catalogId === 'string' && spec.catalogId.trim()
        ? spec.catalogId
        : typeof spec.providerMetadata.imageId === 'string'
            ? spec.providerMetadata.imageId
            : null;

    return imageId ? getOvhcloudImageAdapter(imageId) : null;
}

export async function installOvhcloudServerIfHandled(input: OvhcloudInstallInput): Promise<boolean> {
    const adapter = getAdapterForInstallSpec(input.spec);
    if (!adapter?.lifecycle?.install) return false;

    await adapter.lifecycle.install(input);
    return true;
}

export async function cleanupFailedOvhcloudInstallIfHandled(serverId: number, spec: ResolvedInstallSpec): Promise<void> {
    const adapter = getAdapterForInstallSpec(spec);
    await adapter?.lifecycle?.cleanupFailedInstall?.(serverId, spec);
}

export function getOvhcloudInstallRestartPolicy(spec: ResolvedInstallSpec): 'no' | 'unless-stopped' | undefined {
    return getAdapterForInstallSpec(spec)?.lifecycle?.restartPolicy;
}

export function getServerStopTimeoutSeconds(server: GameServerRow): number {
    if (server.provider !== 'ovhcloud') return DEFAULT_DOCKER_STOP_TIMEOUT_SECONDS;
    return getOvhcloudServerAdapter(server).lifecycle?.stopTimeoutSeconds ?? DEFAULT_DOCKER_STOP_TIMEOUT_SECONDS;
}

export function getServerRestartPolicy(server: GameServerRow): 'no' | 'unless-stopped' {
    if (server.provider !== 'ovhcloud') return 'unless-stopped';
    return getOvhcloudServerAdapter(server).lifecycle?.restartPolicy ?? 'unless-stopped';
}

export async function startOvhcloudServerIfHandled(serverId: number, server: GameServerRow): Promise<boolean> {
    if (server.provider !== 'ovhcloud') return false;
    const adapter = getOvhcloudServerAdapter(server);

    if (!adapter.lifecycle?.start) return false;

    await adapter.lifecycle.start(serverId, server);
    return true;
}

export async function restartOvhcloudServerIfHandled(serverId: number, server: GameServerRow): Promise<boolean> {
    if (server.provider !== 'ovhcloud') return false;
    const adapter = getOvhcloudServerAdapter(server);

    if (!adapter.lifecycle?.restart) return false;

    await adapter.lifecycle.restart(serverId, server);
    return true;
}

export async function afterOvhcloudServerStopped(serverId: number, server: GameServerRow): Promise<void> {
    if (server.provider !== 'ovhcloud') return;
    const adapter = getOvhcloudServerAdapter(server);
    await adapter.lifecycle?.afterStopped?.(serverId, server);
}

export async function beforeOvhcloudServerDelete(serverId: number, server: GameServerRow): Promise<void> {
    if (server.provider !== 'ovhcloud') return;
    const adapter = getOvhcloudServerAdapter(server);
    if (adapter.lifecycle?.beforeDelete) {
        await adapter.lifecycle.beforeDelete(serverId, server);
        return;
    }

    await adapter.lifecycle?.afterStopped?.(serverId, server);
}

export async function recreateOvhcloudServerIfHandled(
    server: GameServerRow,
    input: OvhcloudRecreateInput
): Promise<{ handled: boolean; healthStatus?: HealthStatus }> {
    if (server.provider !== 'ovhcloud') return { handled: false };

    const adapter = getOvhcloudServerAdapter(server);
    if (!adapter.lifecycle?.recreate) return { handled: false };

    const result = await adapter.lifecycle.recreate(server, input);
    return {
        handled: true,
        healthStatus: result.healthStatus,
    };
}
