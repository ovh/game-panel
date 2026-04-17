import type { Database } from 'sqlite';
import { getDatabase } from '../init.js';

export abstract class BaseRepository {
  private db: Database | null = null;

  protected async ensureDb(): Promise<Database> {
    if (!this.db) {
      this.db = await getDatabase();
    }

    return this.db;
  }
}

