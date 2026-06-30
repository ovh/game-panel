import { BaseRepository } from './base.js';
import { nowIso } from '../../utils/time.js';

export type ServerMemberWithUserRow = {
  id: number;
  server_id: number;
  user_id: number;
  permissions_json: string;
  created_at: string;
  updated_at: string;
  username: string;
};

export type ServerMembershipRow = {
  server_id: number;
  permissions_json: string;
  created_at: string;
  updated_at: string;
};

export class ServerMemberRepository extends BaseRepository {
  async listByServer(serverId: number) {
    const db = await this.ensureDb();
    return db.all<ServerMemberWithUserRow[]>(
      `SELECT sm.id,
              sm.server_id,
              sm.user_id,
              sm.permissions_json,
              sm.created_at,
              sm.updated_at,
              u.username
       FROM server_members sm
       JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = ?
       ORDER BY u.username ASC`,
      [serverId]
    );
  }

  async listByUser(userId: number) {
    const db = await this.ensureDb();
    return db.all<ServerMembershipRow[]>(
      `SELECT sm.server_id,
              sm.permissions_json,
              sm.created_at,
              sm.updated_at
       FROM server_members sm
       WHERE sm.user_id = ?
       ORDER BY sm.server_id ASC`,
      [userId]
    );
  }

  async find(serverId: number, userId: number) {
    const db = await this.ensureDb();
    return db.get(
      `SELECT *
       FROM server_members
       WHERE server_id = ? AND user_id = ?`,
      [serverId, userId]
    );
  }

  async create(serverId: number, userId: number, permissions: string[]) {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    await db.run(
      `INSERT INTO server_members (server_id, user_id, permissions_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [serverId, userId, JSON.stringify(permissions), timestamp, timestamp]
    );
  }

  async update(serverId: number, userId: number, permissions: string[]) {
    const db = await this.ensureDb();
    await db.run(
      `UPDATE server_members
       SET permissions_json = ?, updated_at = ?
       WHERE server_id = ? AND user_id = ?`,
      [JSON.stringify(permissions), nowIso(), serverId, userId]
    );
  }

  async delete(serverId: number, userId: number) {
    const db = await this.ensureDb();
    await db.run(
      `DELETE FROM server_members
       WHERE server_id = ? AND user_id = ?`,
      [serverId, userId]
    );
  }

  async getUserServerPermissions(serverId: number, userId: number): Promise<string[]> {
    const db = await this.ensureDb();

    const row = await db.get<{ permissions_json: string }>(
      `SELECT permissions_json
       FROM server_members
       WHERE server_id = ? AND user_id = ?`,
      [serverId, userId]
    );

    if (!row?.permissions_json) return [];

    try {
      const parsed = JSON.parse(row.permissions_json);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
}
