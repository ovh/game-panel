import { BaseRepository } from './base.js';
import type { PanelUpdateJobRow } from '../../types/database.js';
import { nowIso } from '../../utils/time.js';

export class PanelUpdateJobRepository extends BaseRepository {
  async createIfNoneActive(input: {
    targetVersion: string;
    targetTag: string;
    startedBy: string | null;
  }): Promise<number | null> {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    const result = await db.run(
      `INSERT INTO panel_update_jobs
       (target_version, target_tag, status, phase, message, started_by, started_at, created_at, updated_at)
       SELECT ?, ?, 'pending', 'queued', 'Update queued', ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM panel_update_jobs WHERE status IN ('pending', 'running')
       )`,
      [input.targetVersion, input.targetTag, input.startedBy, timestamp, timestamp, timestamp]
    );

    if (!result.changes) return null;
    return result.lastID as number;
  }

  async getLatest(): Promise<PanelUpdateJobRow | null> {
    const db = await this.ensureDb();
    const row = await db.get<PanelUpdateJobRow>(
      `SELECT *
       FROM panel_update_jobs
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    );

    return row ?? null;
  }

  async getRunning(): Promise<PanelUpdateJobRow | null> {
    const db = await this.ensureDb();
    const row = await db.get<PanelUpdateJobRow>(
      `SELECT *
       FROM panel_update_jobs
       WHERE status IN ('pending', 'running')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    );

    return row ?? null;
  }

  async markRunning(id: number, containerId: string): Promise<void> {
    const db = await this.ensureDb();
    await db.run(
      `UPDATE panel_update_jobs
       SET status = 'running',
           phase = 'starting_updater',
           message = 'Updater container started',
           container_id = ?,
           updated_at = ?
       WHERE id = ?`,
      [containerId, nowIso(), id]
    );
  }

  async markFailed(id: number, errorMessage: string): Promise<void> {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    await db.run(
      `UPDATE panel_update_jobs
       SET status = 'failed',
           phase = 'failed',
           error_message = ?,
           finished_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [errorMessage, timestamp, timestamp, id]
    );
  }
}
