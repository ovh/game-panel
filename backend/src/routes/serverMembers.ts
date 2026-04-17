import { Router, type Request, type Response } from 'express';
import { requireGlobalPermission } from '../middleware/auth.js';
import { userRepository, serverMemberRepository, serverRepository } from '../database/index.js';
import { logError } from '../utils/logger.js';

const router = Router();

function parsePositiveNumber(value: unknown): number | null {
    const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePermissions(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const perms = value.filter((x) => typeof x === 'string' && x.trim() !== '');
    return perms.length === value.length ? perms : null;
}

/**
 * GET /servers/:id/members
 */
router.get(
    '/:id/members',
    requireGlobalPermission('users.manage'),
    async (req: Request, res: Response) => {
        try {
            const serverId = parsePositiveNumber(req.params.id);
            if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

            const server = await serverRepository.findById(serverId);
            if (!server) return res.status(404).json({ error: 'Server not found' });

            const members = await serverMemberRepository.listByServer(serverId);

            // Return parsed permission arrays rather than raw JSON payloads.
            const normalized = members.map((m: any) => {
                let permissions: string[] = [];
                try {
                    const parsed = JSON.parse(m.permissions_json ?? '[]');
                    if (Array.isArray(parsed)) permissions = parsed.filter((x) => typeof x === 'string');
                } catch {
                    // Keep an empty permission list if parsing fails.
                }

                return {
                    id: m.id,
                    serverId: m.server_id,
                    userId: m.user_id,
                    username: m.username,
                    permissions,
                    createdAt: m.created_at,
                    updatedAt: m.updated_at,
                };
            });

            return res.json({ members: normalized });
        } catch (error) {
            logError('ROUTE:SERVER_MEMBERS:LIST', error, { serverId: req.params.id });
            return res.status(500).json({ error: 'Failed to list server members' });
        }
    }
);

/**
 * POST /servers/:id/members
 * Add a user to a server with explicit permissions.
 */
router.post(
    '/:id/members',
    requireGlobalPermission('users.manage'),
    async (req: Request, res: Response) => {
        try {
            const serverId = parsePositiveNumber(req.params.id);
            if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

            const userId = parsePositiveNumber((req.body as any)?.userId);
            const permissions = parsePermissions((req.body as any)?.permissions);
            if (!userId || !permissions) {
                return res.status(400).json({ error: 'Missing or invalid userId/permissions' });
            }

            const server = await serverRepository.findById(serverId);
            if (!server) return res.status(404).json({ error: 'Server not found' });

            const user = await userRepository.findById(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const existing = await serverMemberRepository.find(serverId, userId);
            if (existing) return res.status(409).json({ error: 'User already assigned to server' });

            await serverMemberRepository.create(serverId, userId, permissions);

            return res.status(201).json({ success: true });
        } catch (error) {
            logError('ROUTE:SERVER_MEMBERS:CREATE', error, { serverId: req.params.id });
            return res.status(500).json({ error: 'Failed to add server member' });
        }
    }
);

/**
 * PATCH /servers/:id/members/:userId
 * Update permissions for an existing membership.
 */
router.patch(
    '/:id/members/:userId',
    requireGlobalPermission('users.manage'),
    async (req: Request, res: Response) => {
        try {
            const serverId = parsePositiveNumber(req.params.id);
            if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

            const userId = parsePositiveNumber(req.params.userId);
            if (!userId) return res.status(400).json({ error: 'Invalid user id' });

            const permissions = parsePermissions((req.body as any)?.permissions);
            if (!permissions) return res.status(400).json({ error: 'Missing or invalid permissions' });

            const existing = await serverMemberRepository.find(serverId, userId);
            if (!existing) return res.status(404).json({ error: 'Membership not found' });

            await serverMemberRepository.update(serverId, userId, permissions);

            return res.json({ success: true });
        } catch (error) {
            logError('ROUTE:SERVER_MEMBERS:UPDATE', error, {
                serverId: req.params.id,
                userId: req.params.userId,
            });
            return res.status(500).json({ error: 'Failed to update server member' });
        }
    }
);

/**
 * DELETE /servers/:id/members/:userId
 */
router.delete(
    '/:id/members/:userId',
    requireGlobalPermission('users.manage'),
    async (req: Request, res: Response) => {
        try {
            const serverId = parsePositiveNumber(req.params.id);
            if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

            const userId = parsePositiveNumber(req.params.userId);
            if (!userId) return res.status(400).json({ error: 'Invalid user id' });

            const existing = await serverMemberRepository.find(serverId, userId);
            if (!existing) return res.status(404).json({ error: 'Membership not found' });

            await serverMemberRepository.delete(serverId, userId);

            return res.json({ success: true });
        } catch (error) {
            logError('ROUTE:SERVER_MEMBERS:DELETE', error, {
                serverId: req.params.id,
                userId: req.params.userId,
            });
            return res.status(500).json({ error: 'Failed to remove server member' });
        }
    }
);

export default router;
