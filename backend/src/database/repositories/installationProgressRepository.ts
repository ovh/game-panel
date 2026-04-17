import { bus } from '../../realtime/bus.js';
import type { InstallationProgressRow } from '../../types/database.js';
import { nowIso } from '../../utils/time.js';
import { BaseRepository } from './base.js';

export class InstallationProgressRepository extends BaseRepository {
  async create(serverId: number) {
    const db = await this.ensureDb();
    const result = await db.run('INSERT INTO installation_progress (server_id) VALUES (?)', [serverId]);
    return result.lastID;
  }

  async update(serverId: number, progress: number, status: string, errorMessage?: string) {
    const db = await this.ensureDb();
    await db.run(
      'UPDATE installation_progress SET progress_percent = ?, status = ?, error_message = ?, completed_at = ? WHERE server_id = ?',
      [
        progress,
        status,
        errorMessage || null,
        status === 'completed' || status === 'failed' ? nowIso() : null,
        serverId,
      ]
    );

    bus.emit('server.install.progress', {
      serverId,
      progress,
      status,
      errorMessage: errorMessage || null,
      timestamp: nowIso(),
    });
  }

  async getByServerId(serverId: number): Promise<InstallationProgressRow | undefined> {
    const db = await this.ensureDb();
    return db.get<InstallationProgressRow>('SELECT * FROM installation_progress WHERE server_id = ?', [serverId]);
  }
}
