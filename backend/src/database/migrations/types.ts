import type { Database } from 'sqlite';

export type DatabaseMigration = {
  id: string;
  appVersion: string;
  checksum: string;
  up(database: Database): Promise<void>;
};
