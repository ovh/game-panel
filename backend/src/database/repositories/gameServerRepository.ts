import { bus } from '../../realtime/bus.js';
import type { GameServerRow, ServerStatus } from '../../types/gameServer.js';
import { nowIso } from '../../utils/time.js';
import type { NormalizedPortLabels } from '../../utils/ports.js';
import { BaseRepository } from './base.js';

type HealthSpec =
  | { type: 'default' }
  | { type: 'tcp_connect'; port: number }
  | { type: 'process'; name: string };

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
    return db.all<GameServerRow[]>("SELECT * FROM game_servers WHERE status = 'running' ORDER BY updated_at DESC");
  }

  async create(
    name: string,
    gameKey: string,
    gameServerName: string,
    dockerImage: string,
    portMappings: unknown,
    portLabels: NormalizedPortLabels,
    health?: HealthSpec,
    initialStatus: ServerStatus = 'stopped'
  ): Promise<number> {
    const db = await this.ensureDb();

    const hc: HealthSpec = health ?? { type: 'default' };

    let healthType: 'tcp_connect' | 'process' | null = null;
    let healthPort: number | null = null;
    let healthProcess: string | null = null;

    switch (hc.type) {
      case 'default':
        break;
      case 'tcp_connect':
        healthType = 'tcp_connect';
        healthPort = hc.port;
        break;
      case 'process':
        healthType = 'process';
        healthProcess = hc.name;
        break;
    }

    const result = await db.run(
      `INSERT INTO game_servers
       (name, game_key, game_server_name, docker_image,
        healthcheck_type, healthcheck_port, healthcheck_process,
        port_mappings_json, port_labels_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        gameKey,
        gameServerName,
        dockerImage,
        healthType,
        healthPort,
        healthProcess,
        JSON.stringify(portMappings),
        JSON.stringify(portLabels),
        initialStatus,
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
      `UPDATE game_servers SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );
  }

  async updateStatus(id: number, status: ServerStatus) {
    const db = await this.ensureDb();
    await db.run(
      'UPDATE game_servers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
    bus.emit('server.status', { serverId: id, status, timestamp: nowIso() });
  }

  async updateStatusIfChanged(id: number, status: ServerStatus) {
    const db = await this.ensureDb();

    const current = await db.get<{ status: string }>('SELECT status FROM game_servers WHERE id = ?', [id]);
    if (!current) return;
    if (current.status === status) return;

    await db.run(
      'UPDATE game_servers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
    bus.emit('server.status', { serverId: id, status, timestamp: nowIso() });
  }

  async updateDockerInfo(id: number, containerId: string, containerName: string) {
    const db = await this.ensureDb();
    await db.run(
      'UPDATE game_servers SET docker_container_id = ?, docker_container_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [containerId, containerName, id]
    );
  }

  async listServersWithSftpUser(): Promise<Array<{ id: number; sftp_username: string }>> {
    const db = await this.ensureDb();
    return db.all('SELECT id, sftp_username FROM game_servers WHERE sftp_username IS NOT NULL');
  }

  async updateSftp(serverId: number, username: string, enabled: boolean) {
    const db = await this.ensureDb();
    const enabledInt = enabled ? 1 : 0;

    const current = await db.get<{ sftp_enabled: number; sftp_username: string | null }>(
      'SELECT sftp_enabled, sftp_username FROM game_servers WHERE id = ?',
      [serverId]
    );
    if (!current) return;

    const changed =
      Number(current.sftp_enabled ?? 0) !== enabledInt ||
      String(current.sftp_username ?? '') !== String(username ?? '');

    await db.run(
      'UPDATE game_servers SET sftp_username = ?, sftp_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [username, enabledInt, serverId]
    );

    if (changed) {
      bus.emit('server.sftp', { serverId, timestamp: nowIso() });
    }
  }

  async delete(id: number) {
    const db = await this.ensureDb();
    await db.run('DELETE FROM game_servers WHERE id = ?', [id]);
  }
}
