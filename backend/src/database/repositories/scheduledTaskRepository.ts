import type { ScheduledTaskRow } from '../../types/database.js';
import { nowIso } from '../../utils/time.js';
import { BaseRepository } from './base.js';

export type CreateScheduledTaskInput = {
  serverId: number;
  type: ScheduledTaskRow['type'];
  schedule: string;
  enabled: boolean;
  payload: Record<string, unknown>;
  nextRunAt: string | null;
};

export type UpdateScheduledTaskInput = Partial<{
  type: ScheduledTaskRow['type'];
  schedule: string;
  enabled: boolean;
  payload: Record<string, unknown>;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lockedAt: string | null;
}>;

export class ScheduledTaskRepository extends BaseRepository {
  async create(input: CreateScheduledTaskInput): Promise<ScheduledTaskRow> {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    const result = await db.run(
      `INSERT INTO server_scheduled_tasks
       (server_id, type, schedule, enabled, payload_json, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.serverId,
        input.type,
        input.schedule,
        input.enabled ? 1 : 0,
        JSON.stringify(input.payload ?? {}),
        input.nextRunAt,
        timestamp,
        timestamp,
      ]
    );

    const row = await this.findById(result.lastID as number);
    if (!row) throw new Error('Created scheduled task could not be loaded');
    return row;
  }

  async findById(id: number): Promise<ScheduledTaskRow | undefined> {
    const db = await this.ensureDb();
    return db.get<ScheduledTaskRow>(
      'SELECT * FROM server_scheduled_tasks WHERE id = ?',
      [id]
    );
  }

  async findByIdForServer(id: number, serverId: number): Promise<ScheduledTaskRow | undefined> {
    const db = await this.ensureDb();
    return db.get<ScheduledTaskRow>(
      'SELECT * FROM server_scheduled_tasks WHERE id = ? AND server_id = ?',
      [id, serverId]
    );
  }

  async listForServer(serverId: number): Promise<ScheduledTaskRow[]> {
    const db = await this.ensureDb();
    return db.all<ScheduledTaskRow[]>(
      `SELECT * FROM server_scheduled_tasks
       WHERE server_id = ?
       ORDER BY id ASC`,
      [serverId]
    );
  }

  async listDue(nowIso: string, limit = 20): Promise<ScheduledTaskRow[]> {
    const db = await this.ensureDb();
    return db.all<ScheduledTaskRow[]>(
      `SELECT * FROM server_scheduled_tasks
       WHERE enabled = 1
         AND next_run_at IS NOT NULL
         AND next_run_at <= ?
         AND locked_at IS NULL
       ORDER BY next_run_at ASC, id ASC
       LIMIT ?`,
      [nowIso, limit]
    );
  }

  async unlockAllLocked(): Promise<void> {
    const db = await this.ensureDb();
    await db.run(
      `UPDATE server_scheduled_tasks
       SET locked_at = NULL, updated_at = ?
       WHERE locked_at IS NOT NULL`,
      [nowIso()]
    );
  }

  async update(id: number, input: UpdateScheduledTaskInput): Promise<ScheduledTaskRow | undefined> {
    const db = await this.ensureDb();
    const current = await this.findById(id);
    if (!current) return undefined;

    await db.run(
      `UPDATE server_scheduled_tasks
       SET type = ?,
           schedule = ?,
           enabled = ?,
           payload_json = ?,
           next_run_at = ?,
           last_run_at = ?,
           last_status = ?,
           last_error = ?,
           locked_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        input.type ?? current.type,
        input.schedule ?? current.schedule,
        input.enabled !== undefined ? (input.enabled ? 1 : 0) : current.enabled,
        input.payload !== undefined ? JSON.stringify(input.payload) : current.payload_json,
        input.nextRunAt !== undefined ? input.nextRunAt : current.next_run_at,
        input.lastRunAt !== undefined ? input.lastRunAt : current.last_run_at,
        input.lastStatus !== undefined ? input.lastStatus : current.last_status,
        input.lastError !== undefined ? input.lastError : current.last_error,
        input.lockedAt !== undefined ? input.lockedAt : current.locked_at,
        nowIso(),
        id,
      ]
    );

    return this.findById(id);
  }

  async lock(id: number, lockedAt: string): Promise<boolean> {
    const db = await this.ensureDb();
    const result = await db.run(
      `UPDATE server_scheduled_tasks
       SET locked_at = ?, updated_at = ?
       WHERE id = ? AND locked_at IS NULL`,
      [lockedAt, nowIso(), id]
    );
    return Number(result.changes ?? 0) > 0;
  }

  async finish(id: number, input: {
    nextRunAt: string | null;
    lastStatus: string;
    lastError?: string | null;
  }): Promise<void> {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    await db.run(
      `UPDATE server_scheduled_tasks
       SET last_run_at = ?,
           next_run_at = ?,
           last_status = ?,
           last_error = ?,
           locked_at = NULL,
           updated_at = ?
       WHERE id = ?`,
      [timestamp, input.nextRunAt, input.lastStatus, input.lastError ?? null, timestamp, id]
    );
  }

  async unlock(id: number): Promise<void> {
    const db = await this.ensureDb();
    await db.run(
      `UPDATE server_scheduled_tasks
       SET locked_at = NULL, updated_at = ?
       WHERE id = ?`,
      [nowIso(), id]
    );
  }

  async delete(id: number): Promise<void> {
    const db = await this.ensureDb();
    await db.run('DELETE FROM server_scheduled_tasks WHERE id = ?', [id]);
  }
}
