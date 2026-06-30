import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getServerStoragePaths } from '../utils/storage.js';
import {
    ensureResolvedPathInsideRoot,
    listDirectory,
    resolveSafeChildPath,
    type FsEntry
} from '../utils/fsBrowser.js';
import { getServerOrThrow } from './servers.js';
import type { GameServerRow } from '../types/gameServer.js';
import { parseStoredMounts } from '../providers/runtimeConfig.js';

type ListFilesResult = {
    root: string;
    path: string;
    entries: FsEntry[];
    roots: FileRoot[];
};

type FileRoot = {
    key: string;
    containerPath: string;
};

type ServerFsRoot = string;

export async function getServerFsRoot(params: {
    serverId: number;
    root: ServerFsRoot;
}): Promise<{ server: GameServerRow; root: string; rootDir: string; roots: FileRoot[] }> {
    const server = await getServerOrThrow(params.serverId);
    const mounts = parseStoredMounts(server);
    const roots = mounts.map((mount) => ({
        key: mount.key,
        containerPath: mount.containerPath,
    }));

    if (roots.length === 0) {
        throw Object.assign(new Error('No filesystem mounts configured for this server'), { statusCode: 404 });
    }

    const root = params.root || 'data';
    const mount = mounts.find((entry) => entry.key === root);
    if (!mount) {
        throw Object.assign(new Error(`Mount root not found: ${root}`), { statusCode: 404 });
    }

    const { serverRoot } = getServerStoragePaths(params.serverId);
    const rootDir = path.join(serverRoot, mount.key);
    return { server, root, rootDir, roots };
}

export async function listServerFileRoots(serverId: number): Promise<{ roots: FileRoot[] }> {
    const server = await getServerOrThrow(serverId);
    const roots = parseStoredMounts(server).map((mount) => ({
        key: mount.key,
        containerPath: mount.containerPath,
    }));

    return { roots };
}

export async function listServerFiles(params: {
    serverId: number;
    path?: string;
    root?: ServerFsRoot;
}): Promise<ListFilesResult> {
    const root = params.root ?? 'data';
    const fsRoot = await getServerFsRoot({ serverId: params.serverId, root });

    const resolved = resolveSafeChildPath(fsRoot.rootDir, params.path);
    const st = await fs.lstat(resolved.absPath).catch(() => null);

    if (!st) throw Object.assign(new Error('Path not found'), { statusCode: 404 });
    if (st.isSymbolicLink()) throw Object.assign(new Error('Symbolic links are not allowed'), { statusCode: 400 });
    await ensureResolvedPathInsideRoot(resolved.absPath, fsRoot.rootDir);
    if (!st.isDirectory()) throw Object.assign(new Error('Path is not a directory'), { statusCode: 400 });

    const entries = await listDirectory(resolved.absPath);
    return {
        root: fsRoot.root,
        path: resolved.apiPath,
        entries,
        roots: fsRoot.roots,
    };
}

export async function resolveServerPath(params: {
    serverId: number;
    path?: string;
    root?: ServerFsRoot;
}): Promise<{ root: string; apiPath: string; absPath: string; rootDir: string }> {
    const root = params.root ?? 'data';
    const fsRoot = await getServerFsRoot({ serverId: params.serverId, root });
    return {
        root: fsRoot.root,
        ...resolveSafeChildPath(fsRoot.rootDir, params.path),
        rootDir: fsRoot.rootDir,
    };
}
