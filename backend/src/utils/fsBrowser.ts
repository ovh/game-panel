import path from 'node:path';
import { promises as fs } from 'node:fs';

export type FsEntry = {
    name: string;
    type: 'dir' | 'file' | 'symlink';
    size: number;
    modifiedAt: string; // ISO
};

function normalizeApiPath(p: string | undefined): string {
    const raw = String(p ?? '/').trim();
    if (!raw) return '/';

    // Force leading slash
    let out = raw.startsWith('/') ? raw : `/${raw}`;

    // Normalize using POSIX rules (API uses "/")
    out = path.posix.normalize(out);

    // Prevent weird cases
    if (out === '.') out = '/';
    if (!out.startsWith('/')) out = `/${out}`;

    return out;
}

export function resolveSafeChildPath(rootAbs: string, apiPath: string | undefined): { apiPath: string; absPath: string } {
    const safeApiPath = normalizeApiPath(apiPath);

    // Block traversal attempts
    if (safeApiPath.includes('..')) {
        throw new Error('Invalid path');
    }
    if (safeApiPath.includes('\0')) {
        throw new Error('Invalid path');
    }

    const rootResolved = path.resolve(rootAbs);
    const abs = path.resolve(rootResolved, `.${safeApiPath}`); // ". + /foo" keeps it under root

    // Ensure abs is inside root
    const prefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
    if (abs !== rootResolved && !abs.startsWith(prefix)) {
        throw new Error('Invalid path');
    }

    return { apiPath: safeApiPath, absPath: abs };
}

export async function listDirectory(absDir: string): Promise<FsEntry[]> {
    const dirents = await fs.readdir(absDir, { withFileTypes: true });

    const entries: FsEntry[] = [];
    for (const d of dirents) {
        // Avoid following symlinks automatically
        const full = path.join(absDir, d.name);
        const st = await fs.lstat(full);

        const type: FsEntry['type'] = st.isSymbolicLink()
            ? 'symlink'
            : st.isDirectory()
                ? 'dir'
                : 'file';

        entries.push({
            name: d.name,
            type,
            size: st.size,
            modifiedAt: st.mtime.toISOString(),
        });
    }

    // Sort: dirs first, then alphabetical
    entries.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
    });

    return entries;
}

function ensureWithinRoot(rootReal: string, targetReal: string): void {
    const prefix = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
    if (targetReal !== rootReal && !targetReal.startsWith(prefix)) {
        throw Object.assign(new Error('Invalid path'), { statusCode: 400 });
    }
}

export async function ensureResolvedPathInsideRoot(absPath: string, rootAbs: string): Promise<void> {
    const [rootReal, targetReal] = await Promise.all([
        fs.realpath(rootAbs).catch(() => null),
        fs.realpath(absPath).catch(() => null),
    ]);

    if (!rootReal || !targetReal) {
        throw Object.assign(new Error('Path not found'), { statusCode: 404 });
    }

    ensureWithinRoot(rootReal, targetReal);
}

export async function ensureIsFile(absPath: string, rootAbs?: string): Promise<void> {
    const st = await fs.lstat(absPath).catch(() => null);
    if (!st) throw Object.assign(new Error('Path not found'), { statusCode: 404 });
    if (st.isSymbolicLink()) throw Object.assign(new Error('Symbolic links are not allowed'), { statusCode: 400 });
    if (!st.isFile()) throw Object.assign(new Error('Path is not a file'), { statusCode: 400 });

    if (rootAbs) {
        await ensureResolvedPathInsideRoot(absPath, rootAbs);
    }
}

export async function ensureIsDir(absPath: string, rootAbs?: string): Promise<void> {
    const st = await fs.lstat(absPath).catch(() => null);
    if (!st) throw Object.assign(new Error('Path not found'), { statusCode: 404 });
    if (st.isSymbolicLink()) throw Object.assign(new Error('Symbolic links are not allowed'), { statusCode: 400 });
    if (!st.isDirectory()) throw Object.assign(new Error('Path is not a directory'), { statusCode: 400 });

    if (rootAbs) {
        await ensureResolvedPathInsideRoot(absPath, rootAbs);
    }
}

export function getBasenameFromApiPath(apiPath: string): string {
    return path.posix.basename(apiPath === '/' ? 'file' : apiPath);
}

export function guessContentTypeByName(name: string): string {
    const n = name.toLowerCase();

    if (n.endsWith('.txt') || n.endsWith('.log') || n.endsWith('.cfg') || n.endsWith('.conf')) return 'text/plain; charset=utf-8';
    if (n.endsWith('.json')) return 'application/json; charset=utf-8';
    if (n.endsWith('.properties') || n.endsWith('.yml') || n.endsWith('.yaml')) return 'text/plain; charset=utf-8';
    if (n.endsWith('.sh')) return 'text/x-shellscript; charset=utf-8';
    if (n.endsWith('.md')) return 'text/markdown; charset=utf-8';
    if (n.endsWith('.xml')) return 'application/xml; charset=utf-8';
    if (n.endsWith('.html')) return 'text/html; charset=utf-8';
    if (n.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (n.endsWith('.ts')) return 'text/plain; charset=utf-8';

    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.webp')) return 'image/webp';

    return 'application/octet-stream';
}
