import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ServerMountOwnership } from '../../../../utils/storage.js';

export async function writeJsonSecret(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(raw) as T;
    } catch (error: any) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
}

export async function chownRecursive(targetPath: string, ownership: ServerMountOwnership): Promise<void> {
    const st = await fs.lstat(targetPath);
    if (st.isSymbolicLink()) return;

    await fs.chown(targetPath, ownership.uid, ownership.gid);
    if (!st.isDirectory()) return;

    const entries = await fs.readdir(targetPath);
    for (const entry of entries) {
        await chownRecursive(path.join(targetPath, entry), ownership);
    }
}

export async function downloadFile(url: string, destination: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error(`Failed to download ${url}: HTTP ${response.status} ${response.statusText}`);
    }

    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await pipeline(response.body as any, createWriteStream(destination, { mode: 0o600 }));
}
