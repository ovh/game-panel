import { bus } from '../../realtime/bus.js';
import type { FileTransferJobRow } from '../../types/database.js';
import { nowIso, secondsAgoIso, toIsoTimestamp, toIsoTimestampOrNull } from '../../utils/time.js';
import { BaseRepository } from './base.js';

type CreateFileTransferJobInput = {
  serverId: number;
  kind: FileTransferJobRow['kind'];
  root: string;
  basePath: string;
  totalBytes?: number;
  totalFiles?: number;
  payload?: Record<string, unknown>;
};

type UpdateProgressInput = {
  transferredBytes?: number;
  completedFiles?: number;
  artifactPath?: string | null;
  payload?: Record<string, unknown>;
};

export class FileTransferJobRepository extends BaseRepository {
  async create(input: CreateFileTransferJobInput): Promise<FileTransferJobRow> {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    const result = await db.run(
      `INSERT INTO file_transfer_jobs
       (server_id, kind, status, root, base_path, total_bytes, total_files, payload_json, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.serverId,
        input.kind,
        input.root,
        input.basePath,
        Math.max(0, Math.floor(input.totalBytes ?? 0)),
        Math.max(0, Math.floor(input.totalFiles ?? 0)),
        JSON.stringify(input.payload ?? {}),
        timestamp,
        timestamp,
      ]
    );

    const row = await this.findById(result.lastID as number);
    if (!row) throw new Error('Created file transfer job could not be loaded');
    this.emit(row);
    return row;
  }

  async findById(id: number): Promise<FileTransferJobRow | undefined> {
    const db = await this.ensureDb();
    return db.get<FileTransferJobRow>(
      'SELECT * FROM file_transfer_jobs WHERE id = ?',
      [id]
    );
  }

  async findByIdForServer(id: number, serverId: number): Promise<FileTransferJobRow | undefined> {
    const db = await this.ensureDb();
    return db.get<FileTransferJobRow>(
      'SELECT * FROM file_transfer_jobs WHERE id = ? AND server_id = ?',
      [id, serverId]
    );
  }

  async listRecentForServer(serverId: number, limit = 20): Promise<FileTransferJobRow[]> {
    const db = await this.ensureDb();
    return db.all<FileTransferJobRow[]>(
      `SELECT * FROM file_transfer_jobs
       WHERE server_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [serverId, limit]
    );
  }

  async listFinishedOlderThan(seconds: number): Promise<FileTransferJobRow[]> {
    const db = await this.ensureDb();
    const safeSeconds = Math.max(1, Math.floor(seconds));
    return db.all<FileTransferJobRow[]>(
      `SELECT * FROM file_transfer_jobs
       WHERE status IN ('completed','failed','cancelled')
         AND completed_at IS NOT NULL
         AND completed_at <= ?
       ORDER BY id ASC`,
      [secondsAgoIso(safeSeconds)]
    );
  }

  async deleteByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.ensureDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.run(
      `DELETE FROM file_transfer_jobs WHERE id IN (${placeholders})`,
      ids
    );
  }

  async start(id: number): Promise<FileTransferJobRow | undefined> {
    return this.setStatus(id, 'running');
  }

  async updateProgress(id: number, input: UpdateProgressInput): Promise<FileTransferJobRow | undefined> {
    const db = await this.ensureDb();
    const current = await this.findById(id);
    if (!current) return undefined;

    await db.run(
      `UPDATE file_transfer_jobs
       SET transferred_bytes = ?,
           completed_files = ?,
           artifact_path = ?,
           payload_json = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        Math.max(0, Math.floor(input.transferredBytes ?? current.transferred_bytes)),
        Math.max(0, Math.floor(input.completedFiles ?? current.completed_files)),
        input.artifactPath !== undefined ? input.artifactPath : current.artifact_path,
        JSON.stringify(input.payload ?? parsePayload(current)),
        nowIso(),
        id,
      ]
    );

    const row = await this.findById(id);
    if (row) this.emit(row);
    return row;
  }

  async complete(id: number, input: UpdateProgressInput = {}): Promise<FileTransferJobRow | undefined> {
    await this.updateProgress(id, input);
    return this.setStatus(id, 'completed');
  }

  async fail(id: number, errorMessage: string): Promise<FileTransferJobRow | undefined> {
    return this.setStatus(id, 'failed', errorMessage);
  }

  async cancel(id: number): Promise<FileTransferJobRow | undefined> {
    return this.setStatus(id, 'cancelled');
  }

  private async setStatus(
    id: number,
    status: FileTransferJobRow['status'],
    errorMessage?: string | null
  ): Promise<FileTransferJobRow | undefined> {
    const db = await this.ensureDb();
    const timestamp = nowIso();
    const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? timestamp : null;
    await db.run(
      `UPDATE file_transfer_jobs
       SET status = ?,
           error_message = ?,
           updated_at = ?,
           completed_at = COALESCE(?, completed_at)
       WHERE id = ?`,
      [status, errorMessage ?? null, timestamp, completedAt, id]
    );

    const row = await this.findById(id);
    if (row) this.emit(row);
    return row;
  }

  private emit(row: FileTransferJobRow): void {
    bus.emit('server.file.transfer', {
      serverId: row.server_id,
      job: serializeFileTransferJob(row),
      timestamp: nowIso(),
    });
  }
}

export function parsePayload(row: FileTransferJobRow): Record<string, unknown> {
  try {
    const parsed = JSON.parse(row.payload_json || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function serializeFileTransferJob(row: FileTransferJobRow) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    root: row.root,
    basePath: row.base_path,
    totalBytes: row.total_bytes,
    transferredBytes: row.transferred_bytes,
    totalFiles: row.total_files,
    completedFiles: row.completed_files,
    errorMessage: row.error_message,
    payload: parsePayload(row),
    artifactPath: row.artifact_path,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    completedAt: toIsoTimestampOrNull(row.completed_at),
  };
}

export type SerializedFileTransferJob = ReturnType<typeof serializeFileTransferJob>;
