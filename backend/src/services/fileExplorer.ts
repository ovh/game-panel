import { promises as fs } from 'node:fs';
import { getServerStoragePaths } from '../utils/storage.js';
import {
    ensureResolvedPathInsideRoot,
    listDirectory,
    resolveSafeChildPath,
    type FsEntry
} from '../utils/fsBrowser.js';
import { getServerOrThrow } from './servers.js';

type ListFilesResult = {
    path: string;
    entries: FsEntry[];
};

type ServerFsRoot = 'data' | 'backup';

async function getServerFsRoot(params: {
    serverId: number;
    root: ServerFsRoot;
}): Promise<{ server: any; rootDir: string }> {
    const server = await getServerOrThrow(params.serverId);

    const { dataDir, backupDir } = getServerStoragePaths(params.serverId);

    const rootDir = params.root === 'backup' ? backupDir : dataDir;
    return { server, rootDir };
}

export async function listServerFiles(params: {
    serverId: number;
    path?: string;
    root?: ServerFsRoot;
}): Promise<ListFilesResult> {
    const root = params.root ?? 'data';
    const { rootDir } = await getServerFsRoot({ serverId: params.serverId, root });

    const resolved = resolveSafeChildPath(rootDir, params.path);
    const st = await fs.lstat(resolved.absPath).catch(() => null);

    if (!st) throw Object.assign(new Error('Path not found'), { statusCode: 404 });
    if (st.isSymbolicLink()) throw Object.assign(new Error('Symbolic links are not allowed'), { statusCode: 400 });
    await ensureResolvedPathInsideRoot(resolved.absPath, rootDir);
    if (!st.isDirectory()) throw Object.assign(new Error('Path is not a directory'), { statusCode: 400 });

    const entries = await listDirectory(resolved.absPath);
    return { path: resolved.apiPath, entries };
}

export async function resolveServerPath(params: {
    serverId: number;
    path?: string;
    root?: ServerFsRoot;
}): Promise<{ apiPath: string; absPath: string; rootDir: string }> {
    const root = params.root ?? 'data';
    const { rootDir } = await getServerFsRoot({ serverId: params.serverId, root });
    return {
        ...resolveSafeChildPath(rootDir, params.path),
        rootDir,
    };
}
