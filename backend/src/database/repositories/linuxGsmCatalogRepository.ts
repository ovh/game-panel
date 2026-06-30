import { BaseRepository } from './base.js';

export type LinuxGsmGameRow = {
  shortname: string;
  gameservername: string;
  gamename: string;
  os: string | null;
  docker_image: string;
  fetched_at: string;
};

export type LinuxGsmManifestMetaRow = {
  id: 1;
  source_url: string;
  content_hash: string | null;
  fetched_at: string;
};

export class LinuxGsmCatalogRepository extends BaseRepository {
  async listAll(): Promise<LinuxGsmGameRow[]> {
    const db = await this.ensureDb();
    return db.all<LinuxGsmGameRow[]>(
      'SELECT * FROM linuxgsm_games ORDER BY gamename COLLATE NOCASE ASC, shortname COLLATE NOCASE ASC'
    );
  }

  async findByShortname(shortname: string): Promise<LinuxGsmGameRow | null> {
    const db = await this.ensureDb();
    const row = await db.get<LinuxGsmGameRow>(
      'SELECT * FROM linuxgsm_games WHERE shortname = ?',
      [shortname]
    );
    return row ?? null;
  }

  async getMeta(): Promise<LinuxGsmManifestMetaRow | null> {
    const db = await this.ensureDb();
    const row = await db.get<LinuxGsmManifestMetaRow>(
      'SELECT * FROM linuxgsm_manifest_meta WHERE id = 1'
    );
    return row ?? null;
  }

  async replaceAll(params: {
    sourceUrl: string;
    contentHash: string;
    fetchedAt: string;
    games: Array<Omit<LinuxGsmGameRow, 'fetched_at'>>;
  }): Promise<void> {
    const db = await this.ensureDb();

    await db.exec('BEGIN');
    try {
      await db.run('DELETE FROM linuxgsm_games');

      for (const game of params.games) {
        await db.run(
          `INSERT INTO linuxgsm_games
           (shortname, gameservername, gamename, os, docker_image, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            game.shortname,
            game.gameservername,
            game.gamename,
            game.os,
            game.docker_image,
            params.fetchedAt,
          ]
        );
      }

      await db.run(
        `INSERT INTO linuxgsm_manifest_meta (id, source_url, content_hash, fetched_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source_url = excluded.source_url,
           content_hash = excluded.content_hash,
           fetched_at = excluded.fetched_at`,
        [params.sourceUrl, params.contentHash, params.fetchedAt]
      );

      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }
}
