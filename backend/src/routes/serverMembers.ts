import { Router, type Request, type Response } from 'express';
import { requireGlobalPermission } from '../middleware/auth.js';
import { userRepository, serverMemberRepository, serverRepository } from '../database/index.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { PERMISSIONS, ASSIGNABLE_SERVER_PERMISSIONS } from '../permissions.js';
import { toIsoTimestamp } from '../utils/time.js';
import { requireBodyObject, requirePositiveInt, stringArray } from '../utils/httpValidation.js';

const router = Router();

function assertAssignableServerPermissions(permissions: string[], res: Response): boolean {
    const invalid = permissions.filter((permission) => !ASSIGNABLE_SERVER_PERMISSIONS.has(permission));
    if (invalid.length > 0) {
        res.status(400).json({
            error: `Unknown or non-assignable server permissions: ${invalid.join(', ')}`,
        });
        return false;
    }
    return true;
}

// GET /api/servers/:id/members
router.get(
    '/:id/members',
    requireGlobalPermission(PERMISSIONS.users.manage),
    async (req: Request, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const server = await serverRepository.findById(serverId);
            if (!server) return res.status(404).json({ error: 'Server not found' });

            const members = await serverMemberRepository.listByServer(serverId);

            // Return parsed permission arrays rather than raw JSON payloads.
            const normalized = members.map((m) => {
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
                    createdAt: toIsoTimestamp(m.created_at),
                    updatedAt: toIsoTimestamp(m.updated_at),
                };
            });

            return res.json({ members: normalized });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SERVER_MEMBERS:LIST',
                fallbackMessage: 'Failed to list server members',
                logContext: { serverId: req.params.id },
            });
        }
    }
);

// POST /api/servers/:id/members
router.post(
    '/:id/members',
    requireGlobalPermission(PERMISSIONS.users.manage),
    async (req: Request, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');
            const body = requireBodyObject(req.body);

            const userId = requirePositiveInt(body.userId, 'Missing or invalid userId/permissions');
            const permissions = stringArray(body.permissions, 'Missing or invalid userId/permissions');
            if (!assertAssignableServerPermissions(permissions, res)) return;

            const server = await serverRepository.findById(serverId);
            if (!server) return res.status(404).json({ error: 'Server not found' });

            const user = await userRepository.findById(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const existing = await serverMemberRepository.find(serverId, userId);
            if (existing) return res.status(409).json({ error: 'User already assigned to server' });

            await serverMemberRepository.create(serverId, userId, permissions);

            return res.status(201).json({ success: true });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SERVER_MEMBERS:CREATE',
                fallbackMessage: 'Failed to add server member',
                logContext: { serverId: req.params.id },
            });
        }
    }
);

// PATCH /api/servers/:id/members/:userId
router.patch(
    '/:id/members/:userId',
    requireGlobalPermission(PERMISSIONS.users.manage),
    async (req: Request, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const userId = requirePositiveInt(req.params.userId, 'Invalid user id');
            const body = requireBodyObject(req.body);

            const permissions = stringArray(body.permissions, 'Missing or invalid permissions');
            if (!assertAssignableServerPermissions(permissions, res)) return;

            const existing = await serverMemberRepository.find(serverId, userId);
            if (!existing) return res.status(404).json({ error: 'Membership not found' });

            await serverMemberRepository.update(serverId, userId, permissions);

            return res.json({ success: true });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SERVER_MEMBERS:UPDATE',
                fallbackMessage: 'Failed to update server member',
                logContext: {
                    serverId: req.params.id,
                    userId: req.params.userId,
                },
            });
        }
    }
);

// DELETE /api/servers/:id/members/:userId
router.delete(
    '/:id/members/:userId',
    requireGlobalPermission(PERMISSIONS.users.manage),
    async (req: Request, res: Response) => {
        try {
            const serverId = requirePositiveInt(req.params.id, 'Invalid server id');

            const userId = requirePositiveInt(req.params.userId, 'Invalid user id');

            const existing = await serverMemberRepository.find(serverId, userId);
            if (!existing) return res.status(404).json({ error: 'Membership not found' });

            await serverMemberRepository.delete(serverId, userId);

            return res.json({ success: true });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:SERVER_MEMBERS:DELETE',
                fallbackMessage: 'Failed to remove server member',
                logContext: {
                    serverId: req.params.id,
                    userId: req.params.userId,
                },
            });
        }
    }
);

export default router;
