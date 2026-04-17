import { Router, type Request, type Response } from 'express';
import { requireGlobalPermission } from '../middleware/auth.js';
import { userRepository } from '../database/index.js';
import { hashPassword } from '../utils/auth.js';
import { logError } from '../utils/logger.js';

const router = Router();

export function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const arr = value
        .filter((x) => typeof x === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    if (arr.length !== value.length) return null;
    return arr;
}

function parsePermsJson(raw: unknown): string[] {
    if (typeof raw !== 'string' || raw.trim() === '') return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function normalizeUsername(value: string): string {
    return value.trim();
}

function isValidUsername(value: string): boolean {
    return value.length > 0 && value.length <= 12;
}

/**
 * GET /users
 * List all users
 */
router.get(
    '/',
    requireGlobalPermission('users.manage'),
    async (_req: Request, res: Response) => {
        try {
            const users = await userRepository.list();

            const normalized = users.map((u: any) => ({
                id: u.id,
                username: u.username,
                isRoot: Boolean(u.is_root),
                isEnabled: Boolean(u.is_enabled),
                globalPermissions: parsePermsJson(u.global_permissions_json),
                createdAt: u.created_at,
                updatedAt: u.updated_at,
            }));

            return res.json({ users: normalized });
        } catch (error) {
            logError('ROUTE:USERS:LIST', error);
            return res.status(500).json({ error: 'Failed to list users' });
        }
    }
);

/**
 * PATCH /users/:id
 * Update user
 */
router.patch(
    '/:id',
    requireGlobalPermission('users.manage'),
    async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);
            if (!id) return res.status(400).json({ error: 'Invalid user id' });

            const user = await userRepository.findById(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (user.is_root) {
                return res.status(403).json({ error: 'Root user cannot be modified' });
            }

            const usernameRaw = asNonEmptyString((req.body as any)?.username);

            const normalizedUsername = usernameRaw ? normalizeUsername(usernameRaw) : undefined;
            if (normalizedUsername !== undefined) {
                if (!isValidUsername(normalizedUsername)) {
                    return res.status(400).json({ error: 'Username must be between 1 and 12 characters' });
                }

                const existing = await userRepository.findByUsername(normalizedUsername);
                if (existing && existing.id !== id) {
                    return res.status(409).json({ error: 'Username already exists' });
                }
            }

            const globalPermissionsRaw = (req.body as any)?.globalPermissions;
            const globalPermissions =
                globalPermissionsRaw === undefined ? undefined : asStringArray(globalPermissionsRaw);

            if (globalPermissionsRaw !== undefined && globalPermissions === null) {
                return res.status(400).json({ error: 'globalPermissions must be an array of strings' });
            }

            if (globalPermissions && globalPermissions.includes('*')) {
                return res.status(400).json({ error: 'Wildcard permission "*" is reserved for root' });
            }

            const isEnabled = typeof (req.body as any)?.is_enabled === 'boolean' ? (req.body as any).is_enabled : undefined;

            await userRepository.updateUser(id, {
                username: normalizedUsername ?? undefined,
                globalPermissions: globalPermissions ?? undefined,
                is_enabled: isEnabled,
            });

            return res.json({ success: true });
        } catch (error) {
            logError('ROUTE:USERS:UPDATE', error, { userId: req.params.id });
            return res.status(500).json({ error: 'Failed to update user' });
        }
    }
);

/**
 * DELETE /users/:id
 */
router.delete(
    '/:id',
    requireGlobalPermission('users.manage'),
    async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);
            if (!id) return res.status(400).json({ error: 'Invalid user id' });

            const user = await userRepository.findById(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (user.is_root) {
                return res.status(403).json({ error: 'Root user cannot be deleted' });
            }

            await userRepository.deleteUser(id);

            return res.json({ success: true });
        } catch (error) {
            logError('ROUTE:USERS:DELETE', error, { userId: req.params.id });
            return res.status(500).json({ error: 'Failed to delete user' });
        }
    }
);

/**
 * POST /users/:id/reset-password
 */
router.post(
    '/:id/reset-password',
    requireGlobalPermission('users.manage'),
    async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id);
            if (!id) return res.status(400).json({ error: 'Invalid user id' });

            const newPassword = asNonEmptyString((req.body as any)?.newPassword);
            if (!newPassword || newPassword.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters' });
            }

            const user = await userRepository.findById(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (user.is_root) {
                return res.status(403).json({ error: 'Root user password should be changed via /auth route' });
            }

            const passwordHash = await hashPassword(newPassword);
            await userRepository.updatePassword(id, passwordHash);

            return res.json({ success: true });
        } catch (error) {
            logError('ROUTE:USERS:RESET_PASSWORD', error, { userId: req.params.id });
            return res.status(500).json({ error: 'Failed to reset password' });
        }
    }
);

export default router;
