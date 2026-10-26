import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Response } from 'express';
import { checkCod4Files } from '../providers/linuxgsm/adapters/cod4/index.js';
import { authMiddleware, requireServerPermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { getConfig } from '../config.js';
import { PERMISSIONS } from '../permissions.js';
import { docker } from '../utils/docker/client.js';
import { getServerStoragePaths } from '../utils/storage.js';
import { parsePositiveIntId } from '../utils/ids.js';
import { readAdminSettings } from '../services/cod4/settings.js';

// Call of Duty 4: are the game files (cod4-linux folder) and the local image ready? Shown in the install form.
const router = Router();

router.get('/files', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
        res.json({ ...(await checkCod4Files()), defaultSlots: (await readAdminSettings()).cod4Defaults.slots });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Could not check the CoD4 files' });
    }
});

// FastDL (gp-fastdl.sh): this server's own FastDL URL (<base>/<server number>), whether its web server runs, and which
// of this server's mods / maps it publishes. gp-fastdl.sh keeps its state in the panel's data folder:
// fastdl/fastdl.json (base url) and fastdl/manifest.json (published files, "<server>/mods/..." and "<server>/usermaps/...").
const FASTDL_EXTENSIONS = /\.(ff|iwd)$/i;

async function readJson<T>(file: string): Promise<T | null> {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch {
        return null;
    }
}

async function listFastDlFiles(serverfiles: string): Promise<string[]> {
    const found: string[] = [];
    for (const section of ['mods', 'usermaps']) {
        const walk = async (dir: string): Promise<void> => {
            for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
                if (entry.name.startsWith('.')) continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) await walk(full);
                else if (entry.isFile() && FASTDL_EXTENSIONS.test(entry.name)) found.push(path.relative(serverfiles, full));
            }
        };
        // only files inside a mod / map folder count, like for the sync service
        for (const folder of await fs.readdir(path.join(serverfiles, section), { withFileTypes: true }).catch(() => [])) {
            if (folder.isDirectory() && !folder.name.startsWith('.')) await walk(path.join(serverfiles, section, folder.name));
        }
    }
    return found.sort();
}

router.get(
    '/fastdl/:id',
    authMiddleware,
    requireServerPermission(PERMISSIONS.fs.read),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const serverId = parsePositiveIntId(req.params.id);
            if (!serverId) return res.status(400).json({ error: 'Invalid server id' });
            const stateDir = path.join(getConfig().gamepanelDataDir, 'fastdl');
            const info = await readJson<{ url?: string; browserUrl?: string }>(path.join(stateDir, 'fastdl.json'));
            const published = new Set((await readJson<string[]>(path.join(stateDir, 'manifest.json'))) ?? []);
            const running = await docker
                .getContainer('gamepanel-fastdl')
                .inspect()
                .then((c) => Boolean(c.State?.Running))
                .catch(() => false);
            const serverfiles = path.join(getServerStoragePaths(serverId).dataDir, 'serverfiles');
            const files = (await listFastDlFiles(serverfiles)).map((file) => ({
                path: file,
                published: published.has(`${serverId}/${file}`),
            }));
            const url = info?.url ? `${info.url.replace(/\/+$/, '')}/${serverId}` : null;
            // the same files over HTTPS for browsers (the game uses url, plain HTTP)
            const browserUrl = info?.browserUrl ? `${info.browserUrl.replace(/\/+$/, '')}/${serverId}` : null;
            const status = await readJson<{ time?: number; ok?: boolean }>(path.join(stateDir, 'status.json'));
            const lastSync = typeof status?.time === 'number' ? Math.round(status.time * 1000) : null;
            return res.json({ installed: Boolean(url), url, browserUrl, running, lastSync, files });
        } catch (error) {
            return res.status(500).json({ error: error instanceof Error ? error.message : 'Could not read the FastDL status' });
        }
    }
);

// "Sync now": leaves a request for the sync service (gamepanel-fastdl on the host), which checks for it every half
// second, and waits for its result (status.json newer than the request)
router.post(
    '/fastdl/:id/sync',
    authMiddleware,
    requireServerPermission(PERMISSIONS.fs.write),
    async (_req: AuthenticatedRequest, res: Response) => {
        try {
            const stateDir = path.join(getConfig().gamepanelDataDir, 'fastdl');
            if (!(await readJson<{ url?: string }>(path.join(stateDir, 'fastdl.json')))?.url) {
                return res.status(409).json({ error: 'FastDL is not installed (run gp-fastdl.sh on the panel server)' });
            }
            const requestedAt = Date.now();
            await fs.writeFile(path.join(stateDir, 'sync-request'), String(requestedAt));
            for (let waited = 0; waited < 15000; waited += 500) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                const status = await readJson<{ time?: number; ok?: boolean; error?: string; total?: number; added?: number; removed?: number }>(
                    path.join(stateDir, 'status.json')
                );
                if (typeof status?.time === 'number' && status.time * 1000 >= requestedAt) {
                    if (!status.ok) return res.status(500).json({ error: `FastDL sync failed: ${status.error ?? 'unknown error'}` });
                    return res.json({ total: status.total ?? 0, added: status.added ?? 0, removed: status.removed ?? 0 });
                }
            }
            return res.status(504).json({ error: 'The FastDL service did not answer (systemctl status gamepanel-fastdl)' });
        } catch (error) {
            return res.status(500).json({ error: error instanceof Error ? error.message : 'Could not start the FastDL sync' });
        }
    }
);

export default router;
