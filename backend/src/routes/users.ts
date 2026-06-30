import { Router, type Request, type Response } from 'express';
import { requireGlobalPermission } from '../middleware/auth.js';
import { userRepository } from '../database/index.js';
import { hashPassword } from '../utils/auth.js';
import { sendRouteError } from '../utils/routeErrors.js';
import { PERMISSIONS } from '../permissions.js';
import { toIsoTimestamp } from '../utils/time.js';
import { optionalBoolean, requireBodyObject, requirePositiveInt } from '../utils/httpValidation.js';

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

// GET /api/users
router.get(
    '/',
    requireGlobalPermission(PERMISSIONS.users.manage),
    async (_req: Request, res: Response) => {
        try {
            const users = await userRepository.list();

            const normalized = users.map((u) => ({
                id: u.id,
                username: u.username,
                isRoot: Boolean(u.is_root),
                isEnabled: Boolean(u.is_enabled),
                globalPermissions: parsePermsJson(u.global_permissions_json),
                createdAt: toIsoTimestamp(u.created_at),
                updatedAt: toIsoTimestamp(u.updated_at),
            }));

            return res.json({ users: normalized });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:USERS:LIST',
                fallbackMessage: 'Failed to list users',
            });
        }
    }
);

// PATCH /api/users/:id
router.patch(
    '/:id',
    requireGlobalPermission(PERMISSIONS.users.manage),
    async (req: Request, res: Response) => {
        try {
            const id = requirePositiveInt(req.params.id, 'Invalid user id');
            const body = requireBodyObject(req.body);

            const user = await userRepository.findById(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (user.is_root) {
                return res.status(403).json({ error: 'Root user cannot be modified' });
            }

            const usernameRaw = asNonEmptyString(body.username);

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

            const globalPermissionsRaw = body.globalPermissions;
            const globalPermissions =
                globalPermissionsRaw === undefined ? undefined : asStringArray(globalPermissionsRaw);

            if (globalPermissionsRaw !== undefined && globalPermissions === null) {
                return res.status(400).json({ error: 'globalPermissions must be an array of strings' });
            }

            if (globalPermissions && globalPermissions.includes('*')) {
                return res.status(400).json({ error: 'Wildcard permission "*" is reserved for root' });
            }

            const isEnabled = optionalBoolean(body.isEnabled, 'isEnabled must be a boolean');

            await userRepository.updateUser(id, {
                username: normalizedUsername ?? undefined,
                globalPermissions: globalPermissions ?? undefined,
                is_enabled: isEnabled,
            });

            return res.json({ success: true });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:USERS:UPDATE',
                fallbackMessage: 'Failed to update user',
                logContext: { userId: req.params.id },
            });
        }
    }
);

// DELETE /api/users/:id
router.delete(
    '/:id',
    requireGlobalPermission(PERMISSIONS.users.manage),
    async (req: Request, res: Response) => {
        try {
            const id = requirePositiveInt(req.params.id, 'Invalid user id');

            const user = await userRepository.findById(id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (user.is_root) {
                return res.status(403).json({ error: 'Root user cannot be deleted' });
            }

            await userRepository.deleteUser(id);

            return res.json({ success: true });
        } catch (error) {
            return sendRouteError(res, error, {
                route: 'ROUTE:USERS:DELETE',
                fallbackMessage: 'Failed to delete user',
                logContext: { userId: req.params.id },
            });
        }
    }
);

// POST /api/users/:id/reset-password
router.post(
    '/:id/reset-password',
    requireGlobalPermission(PERMISSIONS.users.manage),
    async (req: Request, res: Response) => {
        try {
            const id = requirePositiveInt(req.params.id, 'Invalid user id');
            const body = requireBodyObject(req.body);

            const newPassword = asNonEmptyString(body.newPassword);
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
            return sendRouteError(res, error, {
                route: 'ROUTE:USERS:RESET_PASSWORD',
                fallbackMessage: 'Failed to reset password',
                logContext: { userId: req.params.id },
            });
        }
    }
);

export default router;
