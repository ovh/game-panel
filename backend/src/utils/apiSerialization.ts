import {
    parseStoredEnv,
    parseStoredHealthcheck,
    parseStoredMounts,
    parseStoredPorts,
    parseStoredResourceLimits,
} from '../providers/runtimeConfig.js';
import type { InstallationInteractionRow, InstallationProgressRow, ServerActionRow } from '../types/database.js';
import type { GameServerRow } from '../types/gameServer.js';
import { parseJsonObject } from './json.js';
import { toIsoTimestamp, toIsoTimestampOrNull } from './time.js';

type JsonObject = Record<string, unknown>;

export type SerializedInstallationProgress = {
    id: number;
    serverId: number;
    progress: number;
    status: InstallationProgressRow['status'];
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type SerializedGameServer = {
    id: number;
    name: string;
    provider: GameServerRow['provider'];
    catalogId: string | null;
    dockerImage: string;
    dockerImageDigest: string | null;
    status: GameServerRow['status'];
    desiredState: GameServerRow['desired_state'];
    containerStatus: GameServerRow['container_status'];
    healthStatus: GameServerRow['health_status'];
    dockerContainerId: string | null;
    dockerContainerName: string | null;
    ports: ReturnType<typeof parseStoredPorts>;
    healthcheck: ReturnType<typeof parseStoredHealthcheck>;
    resourceLimits: ReturnType<typeof parseStoredResourceLimits>;
    mounts: ReturnType<typeof parseStoredMounts>;
    env: Record<string, string>;
    runtimeConfig: JsonObject;
    providerMetadata: JsonObject;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
};

export type SerializedGameServerWithInstallProgress = SerializedGameServer & {
    installProgress?: SerializedInstallationProgress;
};

export type SerializedInstallationInteraction = {
    id: number;
    serverId: number;
    kind: string;
    status: InstallationInteractionRow['status'];
    payload: JsonObject;
    response: JsonObject | null;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type SerializedServerAction = {
    id: number;
    serverId: number;
    level: ServerActionRow['level'];
    message: string;
    actorUsername: string | null;
    timestamp: string;
};

function envArrayToObject(entries: string[]): Record<string, string> {
    const env: Record<string, string> = {};

    for (const entry of entries) {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex <= 0) continue;

        const key = entry.slice(0, separatorIndex);
        const value = entry.slice(separatorIndex + 1);
        env[key] = value;
    }

    return env;
}

function parseOptionalJsonObject(raw: unknown): JsonObject {
    return parseJsonObject<JsonObject>(raw, {});
}

export function serializeInstallationProgress(
    row: InstallationProgressRow | undefined | null
): SerializedInstallationProgress | undefined {
    if (!row) return undefined;

    return {
        id: row.id,
        serverId: row.server_id,
        progress: row.progress_percent,
        status: row.status,
        errorMessage: row.error_message,
        startedAt: toIsoTimestamp(row.started_at),
        completedAt: toIsoTimestampOrNull(row.completed_at),
        createdAt: toIsoTimestamp(row.created_at),
        updatedAt: toIsoTimestamp(row.updated_at),
    };
}

export function redactServerEnv<T extends { env: Record<string, string> }>(server: T): T {
    return { ...server, env: {} };
}

export function serializeGameServer(server: GameServerRow): SerializedGameServer {
    return {
        id: server.id,
        name: server.name,
        provider: server.provider,
        catalogId: server.catalog_id,
        dockerImage: server.docker_image,
        dockerImageDigest: server.docker_image_digest,
        status: server.status,
        desiredState: server.desired_state,
        containerStatus: server.container_status,
        healthStatus: server.health_status,
        dockerContainerId: server.docker_container_id,
        dockerContainerName: server.docker_container_name,
        ports: parseStoredPorts(server),
        healthcheck: parseStoredHealthcheck(server),
        resourceLimits: parseStoredResourceLimits(server),
        mounts: parseStoredMounts(server),
        env: envArrayToObject(parseStoredEnv(server)),
        runtimeConfig: parseOptionalJsonObject(server.runtime_config_json),
        providerMetadata: parseOptionalJsonObject(server.provider_metadata_json),
        lastError: server.last_error,
        createdAt: toIsoTimestamp(server.created_at),
        updatedAt: toIsoTimestamp(server.updated_at),
    };
}

export function serializeGameServerWithInstallProgress(
    server: GameServerRow,
    installProgress?: InstallationProgressRow | null
): SerializedGameServerWithInstallProgress {
    return {
        ...serializeGameServer(server),
        installProgress: serializeInstallationProgress(installProgress),
    };
}

export function serializeInstallationInteraction(
    interaction: InstallationInteractionRow
): SerializedInstallationInteraction {
    return {
        id: interaction.id,
        serverId: interaction.server_id,
        kind: interaction.kind,
        status: interaction.status,
        payload: parseOptionalJsonObject(interaction.payload_json),
        response: interaction.response_json ? parseOptionalJsonObject(interaction.response_json) : null,
        expiresAt: toIsoTimestampOrNull(interaction.expires_at),
        createdAt: toIsoTimestamp(interaction.created_at),
        updatedAt: toIsoTimestamp(interaction.updated_at),
    };
}

export function serializeServerAction(row: ServerActionRow): SerializedServerAction {
    return {
        id: row.id,
        serverId: row.server_id,
        level: row.level,
        message: row.message,
        actorUsername: row.actor_username ?? null,
        timestamp: toIsoTimestamp(row.timestamp),
    };
}
