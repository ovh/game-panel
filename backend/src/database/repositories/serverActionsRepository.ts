import { bus } from '../../realtime/bus.js';
import type { ServerActionRow } from '../../types/database.js';
import { nowIso } from '../../utils/time.js';
import { BaseRepository } from './base.js';

export class ServerActionsRepository extends BaseRepository {
  async create(serverId: number, level: string, message: string, actorUsername: string) {
    const db = await this.ensureDb();
    const result = await db.run(
      'INSERT INTO server_actions (server_id, level, message, actor_username) VALUES (?, ?, ?, ?)',
      [serverId, level, message, actorUsername]
    );
    const id = result.lastID as number;

    const keepCount = 100;
    await db.run(
      `
      DELETE FROM server_actions
      WHERE server_id = ?
        AND id NOT IN (
          SELECT id
          FROM server_actions
          WHERE server_id = ?
          ORDER BY id DESC
          LIMIT ?
        )
      `,
      [serverId, serverId, keepCount]
    );

    bus.emit('server.action', {
      serverId,
      level,
      message,
      actorUsername,
      actionId: id,
      timestamp: nowIso(),
    });

    return id;
  }

  async getRecent(serverId: number, limit = 100): Promise<ServerActionRow[]> {
    const db = await this.ensureDb();
    return db.all<ServerActionRow[]>(
      'SELECT * FROM server_actions WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?',
      [serverId, limit]
    );
  }

}
