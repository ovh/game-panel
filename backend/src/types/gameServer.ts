export const SERVER_STATUSES = [
    'running',
    'stopped',
    'installing',
    'starting',
    'stopping',
    'restarting',
] as const;

export type ServerStatus = typeof SERVER_STATUSES[number];

export type HealthcheckType = 'tcp_connect' | 'process';

export interface GameServerRow {
    id: number;
    name: string;

    game_key: string;
    game_server_name: string;

    docker_image: string;

    healthcheck_type: HealthcheckType | null;
    healthcheck_port: number | null;
    healthcheck_process: string | null;

    status: ServerStatus;

    docker_container_id: string | null;
    docker_container_name: string | null;

    port_mappings_json: string;
    port_labels_json: string;

    sftp_username: string | null;
    sftp_enabled: 0 | 1;

    created_at: string;
    updated_at: string;
}
