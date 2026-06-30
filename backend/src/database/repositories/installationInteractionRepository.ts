import { bus } from '../../realtime/bus.js';
import type { InstallationInteractionRow } from '../../types/database.js';
import { nowIso, toIsoTimestampOrNull } from '../../utils/time.js';
import { BaseRepository } from './base.js';

type CreateInteractionInput = {
  serverId: number;
  kind: string;
  payload: Record<string, unknown>;
  expiresAt?: string | null;
};

export class InstallationInteractionRepository extends BaseRepository {
  async create(input: CreateInteractionInput): Promise<number> {
    const db = await this.ensureDb();

    const cancelledRows = await db.all<InstallationInteractionRow[]>(
      `SELECT * FROM installation_interactions
       WHERE server_id = ? AND kind = ? AND status = 'pending'`,
      [input.serverId, input.kind]
    );

    await db.run(
      `UPDATE installation_interactions
       SET status = 'cancelled', updated_at = ?
       WHERE server_id = ? AND kind = ? AND status = 'pending'`,
      [nowIso(), input.serverId, input.kind]
    );

    for (const row of cancelledRows) {
      this.emit({ ...row, status: 'cancelled' });
    }

    const timestamp = nowIso();
    const result = await db.run(
      `INSERT INTO installation_interactions
       (server_id, kind, status, payload_json, expires_at, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
      [
        input.serverId,
        input.kind,
        JSON.stringify(input.payload ?? {}),
        input.expiresAt ?? null,
        timestamp,
        timestamp,
      ]
    );

    const row = await this.findById(result.lastID as number);
    if (row) this.emit(row);

    return result.lastID as number;
  }

  async findById(id: number): Promise<InstallationInteractionRow | undefined> {
    const db = await this.ensureDb();
    return db.get<InstallationInteractionRow>(
      'SELECT * FROM installation_interactions WHERE id = ?',
      [id]
    );
  }

  async getActiveByServerId(serverId: number): Promise<InstallationInteractionRow | undefined> {
    const db = await this.ensureDb();
    return db.get<InstallationInteractionRow>(
      `SELECT * FROM installation_interactions
       WHERE server_id = ? AND status = 'pending'
       ORDER BY id DESC
       LIMIT 1`,
      [serverId]
    );
  }

  async cancelActiveForServer(serverId: number): Promise<void> {
    const db = await this.ensureDb();
    const rows = await db.all<InstallationInteractionRow[]>(
      `SELECT * FROM installation_interactions
       WHERE server_id = ? AND status = 'pending'`,
      [serverId]
    );

    await db.run(
      `UPDATE installation_interactions
       SET status = 'cancelled', updated_at = ?
       WHERE server_id = ? AND status = 'pending'`,
      [nowIso(), serverId]
    );

    for (const row of rows) {
      this.emit({ ...row, status: 'cancelled' });
    }
  }

  async respond(id: number, serverId: number, response: Record<string, unknown>): Promise<InstallationInteractionRow | undefined> {
    const db = await this.ensureDb();
    await db.run(
      `UPDATE installation_interactions
       SET response_json = ?, updated_at = ?
       WHERE id = ? AND server_id = ? AND status = 'pending'`,
      [JSON.stringify(response ?? {}), nowIso(), id, serverId]
    );
    const row = await this.findById(id);
    if (row) this.emit(row);
    return row;
  }

  async complete(id: number): Promise<void> {
    await this.setStatus(id, 'completed');
  }

  async fail(id: number): Promise<void> {
    await this.setStatus(id, 'failed');
  }

  async expire(id: number): Promise<void> {
    await this.setStatus(id, 'expired');
  }

  private async setStatus(id: number, status: InstallationInteractionRow['status']): Promise<void> {
    const db = await this.ensureDb();
    await db.run(
      `UPDATE installation_interactions
       SET status = ?, updated_at = ?
       WHERE id = ?`,
      [status, nowIso(), id]
    );
    const row = await this.findById(id);
    if (row) this.emit(row);
  }

  private emit(row: InstallationInteractionRow): void {
    let payload: Record<string, unknown> = {};
    let response: Record<string, unknown> | null = null;

    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      payload = {};
    }

    try {
      response = row.response_json ? JSON.parse(row.response_json) : null;
    } catch {
      response = null;
    }

    bus.emit('server.install.interaction', {
      id: row.id,
      serverId: row.server_id,
      kind: row.kind,
      status: row.status,
      payload,
      response,
      expiresAt: toIsoTimestampOrNull(row.expires_at),
      timestamp: nowIso(),
    });
  }
}
