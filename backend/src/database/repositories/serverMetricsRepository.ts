import type { ServerMetricRow } from '../../types/database.js';
import { BaseRepository } from './base.js';

export class ServerMetricsRepository extends BaseRepository {
  async create(serverId: number, cpuUsage: number, memoryUsage: number) {
    const db = await this.ensureDb();
    const result = await db.run(
      'INSERT INTO server_metrics (server_id, cpu_usage, memory_usage) VALUES (?, ?, ?)',
      [serverId, cpuUsage, memoryUsage]
    );
    return result.lastID;
  }

  async pruneOlderThanDays(days: number): Promise<number> {
    const db = await this.ensureDb();
    const result = await db.run(
      `DELETE FROM server_metrics
       WHERE timestamp < datetime('now', ?)`,
      [`-${days} day`]
    );
    return result.changes ?? 0;
  }

  async getRecentForLastDays(serverId: number, days: number, limit = 1000): Promise<ServerMetricRow[]> {
    const db = await this.ensureDb();
    return db.all<ServerMetricRow[]>(
      `SELECT *
       FROM server_metrics
       WHERE server_id = ?
         AND timestamp >= datetime('now', ?)
       ORDER BY timestamp DESC
       LIMIT ?`,
      [serverId, `-${days} day`, limit]
    );
  }
}
