import { BaseRepository } from './base.js';

export type DbUserRow = {
  id: number;
  username: string;
  password_hash: string;
  global_permissions_json: string;
  is_root: number;
  is_enabled: number;
  created_at: string;
  updated_at: string;
};

export class UserRepository extends BaseRepository {
  async list(): Promise<Array<Pick<DbUserRow, 'id' | 'username' | 'global_permissions_json' | 'is_root' | 'is_enabled' | 'created_at' | 'updated_at'>>> {
    const db = await this.ensureDb();
    return db.all(
      `SELECT id, username, global_permissions_json, is_root, is_enabled, created_at, updated_at
       FROM users
       ORDER BY created_at ASC`
    );
  }

  async findByUsername(username: string): Promise<DbUserRow | undefined> {
    const db = await this.ensureDb();
    return db.get(
      `SELECT id, username, password_hash, global_permissions_json, is_root, is_enabled, created_at, updated_at
       FROM users
       WHERE LOWER(username) = LOWER(?)
       LIMIT 1`,
      [username]
    );
  }

  async findById(id: number): Promise<DbUserRow | undefined> {
    const db = await this.ensureDb();
    return db.get(
      `SELECT id, username, password_hash, global_permissions_json, is_root, is_enabled, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [id]
    );
  }

  async create(
    username: string,
    passwordHash: string,
    opts?: { globalPermissions?: string[]; isEnabled?: boolean }
  ): Promise<number | undefined> {
    const db = await this.ensureDb();

    const globalPermsJson = JSON.stringify(opts?.globalPermissions ?? []);
    const enabledInt = opts?.isEnabled === false ? 0 : 1;

    const result = await db.run(
      `INSERT INTO users (username, password_hash, global_permissions_json, is_root, is_enabled)
       VALUES (?, ?, ?, 0, ?)`,
      [username, passwordHash, globalPermsJson, enabledInt]
    );

    return result.lastID;
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    const db = await this.ensureDb();
    await db.run(
      `UPDATE users
       SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [passwordHash, id]
    );
  }

  async updateUser(
    id: number,
    data: {
      username?: string;
      globalPermissions?: string[];
      is_enabled?: boolean;
    }
  ): Promise<void> {
    const db = await this.ensureDb();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.username !== undefined) {
      fields.push('username = ?');
      values.push(data.username);
    }

    if (data.globalPermissions !== undefined) {
      fields.push('global_permissions_json = ?');
      values.push(JSON.stringify(data.globalPermissions));
    }

    if (data.is_enabled !== undefined) {
      fields.push('is_enabled = ?');
      values.push(data.is_enabled ? 1 : 0);
    }

    if (fields.length === 0) return;

    await db.run(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );
  }

  async deleteUser(id: number): Promise<void> {
    const db = await this.ensureDb();
    await db.run('DELETE FROM users WHERE id = ?', [id]);
  }

  async getGlobalPermissions(userId: number): Promise<string[]> {
    const db = await this.ensureDb();

    const row = await db.get<{ global_permissions_json: string }>(
      `SELECT global_permissions_json
       FROM users
       WHERE id = ?`,
      [userId]
    );

    const raw = row?.global_permissions_json ?? '[]';

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
}
