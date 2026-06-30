import { getDatabase } from './init.js';
import { hashPassword } from '../utils/auth.js';
import { getConfig, requireAdminBootstrapPassword } from '../config.js';
import { nowIso } from '../utils/time.js';

export async function ensureRootUserExists(): Promise<void> {
  const db = await getDatabase();
  const { adminUsername } = getConfig();

  const existingRoot = await db.get<{ id: number }>('SELECT id FROM users WHERE is_root = 1');
  if (existingRoot?.id) return;

  const adminPassword = requireAdminBootstrapPassword();
  const passwordHash = await hashPassword(adminPassword.trim());
  const globalPermsJson = JSON.stringify(['*']);
  const timestamp = nowIso();

  await db.run(
    `INSERT INTO users (username, password_hash, global_permissions_json, is_root, is_enabled, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, ?, ?)`,
    [adminUsername.trim(), passwordHash, globalPermsJson, timestamp, timestamp]
  );
}
