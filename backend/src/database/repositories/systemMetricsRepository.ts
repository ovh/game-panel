import type { SystemMetricRow } from '../../types/database.js';
import { BaseRepository } from './base.js';

export class SystemMetricsRepository extends BaseRepository {
  async create(
    cpuUsage: number,
    memoryUsage: number,
    diskUsage: number,
    networkIn: number,
    networkOut: number
  ) {
    const db = await this.ensureDb();
    const result = await db.run(
      'INSERT INTO system_metrics (cpu_usage, memory_usage, disk_usage, network_in, network_out) VALUES (?, ?, ?, ?, ?)',
      [cpuUsage, memoryUsage, diskUsage, networkIn, networkOut]
    );
    return result.lastID;
  }

  async pruneOlderThanDays(days: number): Promise<number> {
    const db = await this.ensureDb();
    const result = await db.run(
      `DELETE FROM system_metrics
       WHERE timestamp < datetime('now', ?)`,
      [`-${days} day`]
    );
    return result.changes ?? 0;
  }

  async getRecentForLastDays(days: number, limit = 1000): Promise<SystemMetricRow[]> {
    const db = await this.ensureDb();
    return db.all<SystemMetricRow[]>(
      `SELECT *
       FROM system_metrics
       WHERE timestamp >= datetime('now', ?)
       ORDER BY timestamp DESC
       LIMIT ?`,
      [`-${days} day`, limit]
    );
  }
}
