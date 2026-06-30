import { bus } from '../../realtime/bus.js';
import type {
  ContainerStatus,
  DesiredServerState,
  GameServerRow,
  HealthStatus,
  ServerStatus,
} from '../../types/gameServer.js';
import type { ServerProvider } from '../../providers/types.js';
import { nowIso } from '../../utils/time.js';
import type { NormalizedPorts } from '../../utils/ports.js';
import type { NormalizedResourceLimits } from '../../utils/resourceLimits.js';
import { BaseRepository } from './base.js';

type CreateGameServerInput = {
  name: string;
  provider: ServerProvider;
  catalogId: string | null;
  dockerImage: string;
  dockerImageDigest?: string | null;
  ports: NormalizedPorts;
  healthcheck: unknown | null;
  resourceLimits: NormalizedResourceLimits;
  mounts: unknown;
  env: string[];
  runtimeConfig: Record<string, unknown>;
  providerMetadata: Record<string, unknown>;
  initialStatus?: ServerStatus;
  desiredState?: DesiredServerState;
  containerStatus?: ContainerStatus;
  healthStatus?: HealthStatus;
  lastError?: string | null;
};

export class GameServerRepository extends BaseRepository {
  async findById(id: number): Promise<GameServerRow | null> {
    const db = await this.ensureDb();
    const row = await db.get<GameServerRow>('SELECT * FROM game_servers WHERE id = ?', [id]);
    return row ?? null;
  }

  async findByName(name: string) {
    const db = await this.ensureDb();
    return db.get<GameServerRow>('SELECT * FROM game_servers WHERE name = ?', [name]);
  }

  async listAll(): Promise<GameServerRow[]> {
    const db = await this.ensureDb();
    return db.all<GameServerRow[]>('SELECT * FROM game_servers ORDER BY created_at DESC');
  }

  async findRunningServers(): Promise<GameServerRow[]> {
    const db = await this.ensureDb();
    return db.all<GameServerRow[]>("SELECT * FROM game_servers WHERE container_status = 'running' ORDER BY updated_at DESC");
  }

  async create(input: CreateGameServerInput): Promise<number> {
    const db = await this.ensureDb();
    const timestamp = nowIso();

    const result = await db.run(
      `INSERT INTO game_servers
       (name, provider, catalog_id,
        docker_image, docker_image_digest, status, desired_state,
        container_status, health_status,
        ports_json, healthcheck_json, resource_limits_json, mounts_json, env_json,
        runtime_config_json, provider_metadata_json, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.provider,
        input.catalogId,
        input.dockerImage,
        input.dockerImageDigest ?? null,
        input.initialStatus ?? 'stopped',
        input.desiredState ?? 'stopped',
        input.containerStatus ?? 'missing',
        input.healthStatus ?? 'none',
        JSON.stringify(input.ports),
        input.healthcheck ? JSON.stringify(input.healthcheck) : null,
        input.resourceLimits ? JSON.stringify(input.resourceLimits) : null,
        JSON.stringify(input.mounts),
        JSON.stringify(input.env ?? []),
        JSON.stringify(input.runtimeConfig ?? {}),
        JSON.stringify(input.providerMetadata ?? {}),
        input.lastError ?? null,
        timestamp,
        timestamp,
      ]
    );

    return result.lastID as number;
  }

  async update(id: number, data: Partial<GameServerRow>) {
    const db = await this.ensureDb();
    const keys = Object.keys(data);
    if (keys.length === 0) return;

    const setClauses = keys.map((key) => `${key} = ?`).join(', ');
    const values = Object.values(data);

    await db.run(
      `UPDATE game_servers SET ${setClauses}, updated_at = ? WHERE id = ?`,
      [...values, nowIso(), id]
    );
  }

  async updateStatus(id: number, status: ServerStatus) {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    await db.run(
      'UPDATE game_servers SET status = ?, last_error = NULL, updated_at = ? WHERE id = ?',
      [status, timestamp, id]
    );
    bus.emit('server.status', { serverId: id, status, timestamp });
  }

  async updateStatusIfChanged(id: number, status: ServerStatus) {
    const db = await this.ensureDb();

    const current = await db.get<{ status: string }>('SELECT status FROM game_servers WHERE id = ?', [id]);
    if (!current) return;
    if (current.status === status) return;

    const timestamp = nowIso();
    await db.run(
      'UPDATE game_servers SET status = ?, last_error = NULL, updated_at = ? WHERE id = ?',
      [status, timestamp, id]
    );
    bus.emit('server.status', { serverId: id, status, timestamp });
  }

  async updateDesiredState(id: number, desiredState: DesiredServerState) {
    const db = await this.ensureDb();
    await db.run(
      'UPDATE game_servers SET desired_state = ?, updated_at = ? WHERE id = ?',
      [desiredState, nowIso(), id]
    );
  }

  async updateRuntimeState(id: number, runtime: {
    containerStatus: ContainerStatus;
    healthStatus: HealthStatus;
  }) {
    const db = await this.ensureDb();

    const current = await db.get<{
      container_status: ContainerStatus;
      health_status: HealthStatus;
    }>(
      'SELECT container_status, health_status FROM game_servers WHERE id = ?',
      [id]
    );
    if (!current) return;

    if (
      current.container_status === runtime.containerStatus &&
      current.health_status === runtime.healthStatus
    ) {
      return;
    }

    const timestamp = nowIso();
    await db.run(
      'UPDATE game_servers SET container_status = ?, health_status = ?, updated_at = ? WHERE id = ?',
      [runtime.containerStatus, runtime.healthStatus, timestamp, id]
    );
    bus.emit('server.updated', { serverId: id, timestamp });
  }

  async updateRuntimeAndStatusIfChanged(id: number, runtime: {
    containerStatus: ContainerStatus;
    healthStatus: HealthStatus;
    status: ServerStatus;
  }) {
    const db = await this.ensureDb();

    const current = await db.get<{
      status: ServerStatus;
      container_status: ContainerStatus;
      health_status: HealthStatus;
    }>(
      'SELECT status, container_status, health_status FROM game_servers WHERE id = ?',
      [id]
    );
    if (!current) return;

    const statusChanged = current.status !== runtime.status;
    const runtimeChanged =
      current.container_status !== runtime.containerStatus ||
      current.health_status !== runtime.healthStatus;

    if (!statusChanged && !runtimeChanged) return;

    const timestamp = nowIso();
    await db.run(
      `UPDATE game_servers
       SET status = ?, container_status = ?, health_status = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`,
      [runtime.status, runtime.containerStatus, runtime.healthStatus, timestamp, id]
    );

    if (statusChanged) {
      bus.emit('server.status', { serverId: id, status: runtime.status, timestamp });
    } else {
      bus.emit('server.updated', { serverId: id, timestamp });
    }
  }

  async markFailed(id: number, message: string) {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    await db.run(
      'UPDATE game_servers SET status = ?, last_error = ?, updated_at = ? WHERE id = ?',
      ['failed', message, timestamp, id]
    );
    bus.emit('server.status', { serverId: id, status: 'failed', timestamp });
  }

  async updateDockerInfo(id: number, containerId: string, containerName: string) {
    const db = await this.ensureDb();
    await db.run(
      'UPDATE game_servers SET docker_container_id = ?, docker_container_name = ?, updated_at = ? WHERE id = ?',
      [containerId, containerName, nowIso(), id]
    );
  }

  async delete(id: number) {
    const db = await this.ensureDb();
    await db.run('DELETE FROM game_servers WHERE id = ?', [id]);
  }
}
