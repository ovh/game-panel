import express, { type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission } from '../middleware/auth.js';
import { parseServerId } from './servers.js';
import { serverRepository } from '../database/index.js';
import {
    disableSftpUser,
    enableSftpUser,
    ensureChrootPermissions,
    ensureSftpUser,
    setSftpPassword,
    writeSshdMatchFile,
    sftpUserHasPassword,
} from '../services/sftpAccounts.js';
import { getServerOrThrow } from '../services/servers.js';
import { logError } from '../utils/logger.js';

const router = express.Router({ mergeParams: true });

export async function regenerateSshdMatchFromDb(): Promise<void> {
    const rows = await serverRepository.listServersWithSftpUser();
    const ids = rows.map((r: { id: number }) => r.id);
    await writeSshdMatchFile(ids);
}

// POST /api/servers/:id/sftp/password  { password: "..." }
router.post('/password', requireServerPermission('sftp.manage'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const server = await getServerOrThrow(serverId);

        const password = String(req.body?.password ?? '');
        if (!password || password.length < 10) {
            return res.status(400).json({ error: 'Password must be at least 10 chars' });
        }

        const username = server.sftp_username ?? `gp_s${serverId}`;

        await ensureSftpUser(serverId);
        await ensureChrootPermissions(serverId, username);

        await setSftpPassword(username, password);

        const enabled = Number((server as any).sftp_enabled ?? 0) === 1;
        if (!enabled) {
            await disableSftpUser(username);
        }

        return res.json({
            username,
            passwordSet: true,
            enabled: Boolean(server.sftp_enabled),
        });
    } catch (err: any) {
        const statusCode = err?.statusCode ?? 500;
        if (statusCode >= 500) {
            logError('ROUTE:SFTP:PASSWORD', err, { serverId: req.params.id });
        }
        const message = statusCode >= 500 ? 'SFTP password error' : (err?.message ?? 'SFTP password error');
        return res.status(statusCode).json({ error: message });
    }
});

// POST /api/servers/:id/sftp/enable
router.post('/enable', requireServerPermission('sftp.manage'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const server = await getServerOrThrow(serverId);

        const username = server.sftp_username ?? `gp_s${serverId}`;

        const hasPassword = await sftpUserHasPassword(username);
        if (!hasPassword) {
            return res.status(400).json({
                code: 'SFTP_PASSWORD_NOT_SET',
                error: 'SFTP password not set. Please set a password before enabling.',
            });
        }

        await enableSftpUser(username);
        await serverRepository.updateSftp(serverId, username, true);

        return res.json({ username, enabled: true });
    } catch (err: any) {
        const statusCode = err?.statusCode ?? 500;
        if (statusCode >= 500) {
            logError('ROUTE:SFTP:ENABLE', err, { serverId: req.params.id });
        }
        const message = statusCode >= 500 ? 'SFTP enable error' : (err?.message ?? 'SFTP enable error');
        return res.status(statusCode).json({ error: message });
    }
});

// POST /api/servers/:id/sftp/disable
router.post('/disable', requireServerPermission('sftp.manage'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        const serverId = parseServerId(req.params.id);
        if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

        const server = await getServerOrThrow(serverId);

        const username = server.sftp_username ?? `gp_s${serverId}`;

        await disableSftpUser(username);
        await serverRepository.updateSftp(serverId, username, false);

        return res.json({ username, enabled: false });
    } catch (err: any) {
        const statusCode = err?.statusCode ?? 500;
        if (statusCode >= 500) {
            logError('ROUTE:SFTP:DISABLE', err, { serverId: req.params.id });
        }
        const message = statusCode >= 500 ? 'SFTP disable error' : (err?.message ?? 'SFTP disable error');
        return res.status(statusCode).json({ error: message });
    }
});

export default router;
