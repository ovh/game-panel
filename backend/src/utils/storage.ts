import path from 'node:path';
import fs from 'node:fs/promises';
import { getConfig } from '../config.js';

const { gamepanelServersDir } = getConfig();

type ServerStoragePaths = {
  serverRoot: string;
  dataDir: string;
  backupDir: string;
};

export function getServerStoragePaths(storageKey: string | number): ServerStoragePaths {
  const serverRoot = path.join(gamepanelServersDir, String(storageKey));

  return {
    serverRoot,
    dataDir: path.join(serverRoot, 'data'),
    backupDir: path.join(serverRoot, 'backup'),
  };
}

export async function ensureServerDataDirs(storageKey: string | number): Promise<ServerStoragePaths> {
  const id =
    typeof storageKey === 'number'
      ? storageKey
      : Number.parseInt(String(storageKey), 10);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid storageKey/serverId: ${String(storageKey)}`);
  }

  const paths = getServerStoragePaths(id);

  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.mkdir(paths.backupDir, { recursive: true });

  return paths;
}

export async function removeServerDataDir(storageKey: string | number): Promise<void> {
  const id =
    typeof storageKey === 'number'
      ? storageKey
      : Number.parseInt(String(storageKey), 10);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid storageKey/serverId for deletion: ${String(storageKey)}`);
  }

  const target = path.join(gamepanelServersDir, String(id));
  const rootResolved = path.resolve(gamepanelServersDir);
  const targetResolved = path.resolve(target);

  if (!targetResolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`Refusing to delete outside servers dir: ${targetResolved}`);
  }

  await fs.rm(targetResolved, { recursive: true, force: true });
}
