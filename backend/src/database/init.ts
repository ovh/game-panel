import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';
import { getConfig } from '../config.js';

const { gamepanelDataDir } = getConfig();

const dbFilePath = path.join(gamepanelDataDir, '/game-panel.db');

let db: Database | null = null;

/**
 * Initializes the SQLite database (singleton).
 * - Creates the data directory if needed
 * - Enables foreign keys
 * - Creates schema (tables + indexes)
 */
export async function initializeDatabase(): Promise<Database> {
  if (db) return db;

  const dbDir = path.dirname(dbFilePath);
  await fs.mkdir(dbDir, { recursive: true });

  db = await open({
    filename: dbFilePath,
    driver: sqlite3.Database,
  });

  // Enforce FK constraints (SQLite requires this pragma per connection)
  await db.exec('PRAGMA foreign_keys = ON');

  await createSchema(db);

  return db;
}

export async function getDatabase(): Promise<Database> {
  if (!db) return initializeDatabase();
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (!db) return;

  await db.close();
  db = null;
}

/**
 * Creates all tables and indexes.
 */
async function createSchema(database: Database): Promise<void> {
  await database.exec('BEGIN');

  try {
    // Users table
    await database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        global_permissions_json TEXT NOT NULL DEFAULT '[]',
        is_root INTEGER NOT NULL DEFAULT 0 CHECK(is_root IN (0, 1)),
        is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Game servers table
    await database.exec(`
      CREATE TABLE IF NOT EXISTS game_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        game_key TEXT NOT NULL,
        game_server_name TEXT NOT NULL,
        docker_image TEXT NOT NULL,
        healthcheck_type TEXT CHECK(healthcheck_type IN ('default','tcp_connect','process')),
        healthcheck_port INTEGER,
        healthcheck_process TEXT,
        status TEXT DEFAULT 'stopped' CHECK(status IN ('running','stopped','installing','starting','stopping','restarting')),
        docker_container_id TEXT,
        docker_container_name TEXT,
        port_mappings_json TEXT NOT NULL,
        port_labels_json TEXT NOT NULL DEFAULT '{"tcp":{},"udp":{}}',
        sftp_username TEXT,
        sftp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(sftp_enabled IN (0, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Server members: per-server profile assignment
    await database.exec(`
      CREATE TABLE IF NOT EXISTS server_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        permissions_json TEXT NOT NULL DEFAULT '[]', -- JSON array, e.g. ["server.power","fs.read"]
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(server_id, user_id)
      )
    `);

    // Server logs table
    await database.exec(`
      CREATE TABLE IF NOT EXISTS server_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        level TEXT CHECK(level IN ('info', 'warn', 'warning', 'error', 'success', 'command')),
        message TEXT,
        actor_username TEXT,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE
      )
    `);

    // System metrics table
    await database.exec(`
      CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cpu_usage REAL,
        memory_usage REAL,
        disk_usage REAL,
        network_in INTEGER,
        network_out INTEGER
      )
    `);

    // Server metrics table
    await database.exec(`
      CREATE TABLE IF NOT EXISTS server_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cpu_usage REAL,
        memory_usage REAL,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE
      )
    `);

    // Installation progress table
    await database.exec(`
      CREATE TABLE IF NOT EXISTS installation_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        progress_percent INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'downloading', 'extracting', 'installing', 'completed', 'failed')),
        error_message TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE
      )
    `);

    // Indexes (performance)
    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_server_actions_server_time
      ON server_actions(server_id, timestamp);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_server_metrics_server_time
      ON server_metrics(server_id, timestamp);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_system_metrics_time
      ON system_metrics(timestamp);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_install_progress_server
      ON installation_progress(server_id);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_server_members_server
      ON server_members(server_id);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_server_members_user
      ON server_members(user_id);
    `);

    await database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci_unique
      ON users(LOWER(username));
    `);
    
    await database.exec('COMMIT');
    console.log('✓ Database schema ready');
  } catch (err) {
    await database.exec('ROLLBACK');
    throw err;
  }
}
