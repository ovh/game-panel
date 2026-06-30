import type { ServerMetricRow } from '../../types/database.js';
import { daysAgoIso, nowIso } from '../../utils/time.js';
import { BaseRepository } from './base.js';

export class ServerMetricsRepository extends BaseRepository {
  async create(
    serverId: number,
    cpuUsage: number,
    memoryUsage: number,
    diskUsage: number,
    networkIn: number,
    networkOut: number
  ) {
    const db = await this.ensureDb();
    const result = await db.run(
      `INSERT INTO server_metrics
       (server_id, timestamp, cpu_usage, memory_usage, disk_usage, network_in, network_out)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [serverId, nowIso(), cpuUsage, memoryUsage, diskUsage, networkIn, networkOut]
    );
    return result.lastID;
  }

  async pruneOlderThanDays(days: number): Promise<number> {
    const db = await this.ensureDb();
    const result = await db.run(
      `DELETE FROM server_metrics
       WHERE timestamp < ?`,
      [daysAgoIso(days)]
    );
    return result.changes ?? 0;
  }

  async getRecentForLastDays(serverId: number, days: number, limit = 1000): Promise<ServerMetricRow[]> {
    const db = await this.ensureDb();
    return db.all<ServerMetricRow[]>(
      `SELECT *
       FROM server_metrics
       WHERE server_id = ?
         AND timestamp >= ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      [serverId, daysAgoIso(days), limit]
    );
  }
}
