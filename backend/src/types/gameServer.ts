export const SERVER_STATUSES = [
    'running',
    'stopped',
    'creating',
    'installing',
    'starting',
    'stopping',
    'restarting',
    'unhealthy',
    'failed',
] as const;

export type ServerStatus = typeof SERVER_STATUSES[number];

export type DesiredServerState = 'running' | 'stopped';

export const CONTAINER_STATUSES = [
    'missing',
    'created',
    'running',
    'paused',
    'restarting',
    'removing',
    'exited',
    'dead',
    'unknown',
] as const;

export type ContainerStatus = typeof CONTAINER_STATUSES[number];

export const HEALTH_STATUSES = [
    'none',
    'starting',
    'healthy',
    'unhealthy',
    'unknown',
] as const;

export type HealthStatus = typeof HEALTH_STATUSES[number];

export interface GameServerRow {
    id: number;
    name: string;

    provider: 'ovhcloud' | 'linuxgsm' | 'external';
    catalog_id: string | null;

    docker_image: string;
    docker_image_digest: string | null;

    status: ServerStatus;
    desired_state: DesiredServerState;
    container_status: ContainerStatus;
    health_status: HealthStatus;

    docker_container_id: string | null;
    docker_container_name: string | null;

    ports_json: string;
    healthcheck_json: string | null;
    resource_limits_json: string | null;
    mounts_json: string;
    env_json: string;

    runtime_config_json: string;
    provider_metadata_json: string;

    last_error: string | null;

    created_at: string;
    updated_at: string;
}
