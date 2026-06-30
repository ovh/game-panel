import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';
import { getConfig } from '../config.js';
import { DATABASE_MIGRATIONS } from './migrations/index.js';
import type { DatabaseMigration } from './migrations/types.js';
import { nowIso } from '../utils/time.js';
import { logInfo } from '../utils/logger.js';

const { gamepanelDataDir } = getConfig();

const dbFilePath = path.join(gamepanelDataDir, 'game-panel.db');

let db: Database | null = null;

export async function initializeDatabase(): Promise<Database> {
  if (db) return db;

  const dbDir = path.dirname(dbFilePath);
  await fs.mkdir(dbDir, { recursive: true });

  db = await open({
    filename: dbFilePath,
    driver: sqlite3.Database,
  });

  await db.exec('PRAGMA foreign_keys = ON');

  const freshDatabase = await isFreshDatabase(db);
  await ensureSchemaMigrationsTable(db);

  if (freshDatabase) {
    await createSchema(db);
    await markBundledMigrationsAsApplied(db);
  } else {
    await runPendingMigrations(db);
  }

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

async function isFreshDatabase(database: Database): Promise<boolean> {
  const row = await database.get<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
  `);

  return (row?.count ?? 0) === 0;
}

async function ensureSchemaMigrationsTable(database: Database): Promise<void> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      app_version TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

async function getAppliedMigrationIds(database: Database): Promise<Set<string>> {
  const rows = await database.all<{ id: string }[]>(`
    SELECT id
    FROM schema_migrations
  `);

  return new Set(rows.map((row) => row.id));
}

async function insertAppliedMigration(database: Database, migration: DatabaseMigration): Promise<void> {
  await database.run(
    `INSERT OR IGNORE INTO schema_migrations (id, app_version, checksum, applied_at)
     VALUES (?, ?, ?, ?)`,
    [migration.id, migration.appVersion, migration.checksum, nowIso()]
  );
}

async function markBundledMigrationsAsApplied(database: Database): Promise<void> {
  await database.exec('BEGIN');

  try {
    for (const migration of DATABASE_MIGRATIONS) {
      await insertAppliedMigration(database, migration);
    }

    await database.exec('COMMIT');
  } catch (error) {
    await database.exec('ROLLBACK');
    throw error;
  }
}

async function runPendingMigrations(database: Database): Promise<void> {
  const applied = await getAppliedMigrationIds(database);

  for (const migration of DATABASE_MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    await database.exec('BEGIN');
    try {
      await migration.up(database);
      await insertAppliedMigration(database, migration);
      await database.exec('COMMIT');
    } catch (error) {
      await database.exec('ROLLBACK');
      throw error;
    }
  }
}


// Creates all tables and indexes.
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
        token_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Game servers table
    await database.exec(`
      CREATE TABLE IF NOT EXISTS game_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('ovhcloud','linuxgsm','external')),
        catalog_id TEXT,
        docker_image TEXT NOT NULL,
        docker_image_digest TEXT,
        status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('running','stopped','creating','installing','starting','stopping','restarting','unhealthy','failed')),
        desired_state TEXT NOT NULL DEFAULT 'stopped' CHECK(desired_state IN ('running','stopped')),
        container_status TEXT NOT NULL DEFAULT 'missing' CHECK(container_status IN ('missing','created','running','paused','restarting','removing','exited','dead','unknown')),
        health_status TEXT NOT NULL DEFAULT 'none' CHECK(health_status IN ('none','starting','healthy','unhealthy','unknown')),
        docker_container_id TEXT,
        docker_container_name TEXT,
        ports_json TEXT NOT NULL,
        healthcheck_json TEXT,
        resource_limits_json TEXT,
        mounts_json TEXT NOT NULL DEFAULT '[]',
        env_json TEXT NOT NULL DEFAULT '[]',
        runtime_config_json TEXT NOT NULL DEFAULT '{}',
        provider_metadata_json TEXT NOT NULL DEFAULT '{}',
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        app_version TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    await database.exec(`
      CREATE TABLE IF NOT EXISTS linuxgsm_manifest_meta (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        source_url TEXT NOT NULL,
        content_hash TEXT,
        fetched_at TEXT NOT NULL
      );
    `);

    await database.exec(`
      CREATE TABLE IF NOT EXISTS linuxgsm_games (
        shortname TEXT PRIMARY KEY,
        gameservername TEXT NOT NULL,
        gamename TEXT NOT NULL,
        os TEXT,
        docker_image TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
    `);

    // Server members: per-server profile assignment
    await database.exec(`
      CREATE TABLE IF NOT EXISTS server_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        permissions_json TEXT NOT NULL DEFAULT '[]', -- JSON array, e.g. ["server.power","fs.read"]
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
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
        timestamp TEXT NOT NULL,
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
        timestamp TEXT NOT NULL,
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
        timestamp TEXT NOT NULL,
        cpu_usage REAL,
        memory_usage REAL,
        disk_usage REAL,
        network_in INTEGER,
        network_out INTEGER,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE
      )
    `);

    // Installation progress table
    await database.exec(`
      CREATE TABLE IF NOT EXISTS installation_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        progress_percent INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN (
          'pending',
          'pulling_image',
          'preparing_files',
          'hytale_downloader_auth',
          'downloading_server_files',
          'extracting_server_files',
          'hytale_account_auth',
          'hytale_profile_selection',
          'configuring_hytale_auth',
          'creating_container',
          'starting_container',
          'completed',
          'failed'
        )),
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE
      )
    `);

    await database.exec(`
      CREATE TABLE IF NOT EXISTS installation_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed','expired','cancelled')),
        payload_json TEXT NOT NULL DEFAULT '{}',
        response_json TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE
      )
    `);

    await database.exec(`
      CREATE TABLE IF NOT EXISTS file_transfer_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('upload')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','cancelled')),
        root TEXT NOT NULL,
        base_path TEXT NOT NULL,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        transferred_bytes INTEGER NOT NULL DEFAULT 0,
        total_files INTEGER NOT NULL DEFAULT 0,
        completed_files INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        artifact_path TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE
      )
    `);

    await database.exec(`
      CREATE TABLE IF NOT EXISTS server_scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('restart','backup','custom')),
        schedule TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        payload_json TEXT NOT NULL DEFAULT '{}',
        next_run_at TEXT,
        last_run_at TEXT,
        last_status TEXT,
        last_error TEXT,
        locked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE
      )
    `);

    await database.exec(`
      CREATE TABLE IF NOT EXISTS panel_update_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_version TEXT NOT NULL,
        target_tag TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
        phase TEXT NOT NULL DEFAULT 'queued',
        message TEXT,
        error_message TEXT,
        container_id TEXT,
        backup_path TEXT,
        started_by TEXT,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
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
      CREATE INDEX IF NOT EXISTS idx_install_interactions_server_status
      ON installation_interactions(server_id, status);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_file_transfer_jobs_server_status
      ON file_transfer_jobs(server_id, status);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due
      ON server_scheduled_tasks(enabled, next_run_at, locked_at);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_server
      ON server_scheduled_tasks(server_id);
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_panel_update_jobs_status
      ON panel_update_jobs(status, created_at);
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
      CREATE INDEX IF NOT EXISTS idx_game_servers_provider
      ON game_servers(provider);
    `);

    await database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci_unique
      ON users(LOWER(username));
    `);

    await database.exec('COMMIT');
    logInfo('DATABASE', 'Database schema ready');
  } catch (err) {
    await database.exec('ROLLBACK');
    throw err;
  }
}
