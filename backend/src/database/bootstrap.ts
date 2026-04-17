import { getDatabase } from './init.js';
import { hashPassword } from '../utils/auth.js';
import { getConfig } from '../config.js';

export async function ensureRootUserExists(): Promise<void> {
  const db = await getDatabase();
  const { adminUsername, adminPassword } = getConfig();

  const existingRoot = await db.get<{ id: number }>('SELECT id FROM users WHERE is_root = 1');
  if (existingRoot?.id) return;

  const passwordHash = await hashPassword(adminPassword.trim());
  const globalPermsJson = JSON.stringify(['*']);

  await db.run(
    `INSERT INTO users (username, password_hash, global_permissions_json, is_root, is_enabled)
     VALUES (?, ?, ?, 1, 1)`,
    [adminUsername.trim(), passwordHash, globalPermsJson]
  );
}
