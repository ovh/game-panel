import { Router, type Request, type Response } from 'express';
import { type AuthenticatedRequest, authMiddleware, requireGlobalPermission } from '../middleware/auth.js';
import { comparePasswords, generateToken, hashPassword } from '../utils/auth.js';
import { userRepository, serverMemberRepository } from '../database/index.js';
import { asNonEmptyString } from './users.js';
import { logError } from '../utils/logger.js';

const router = Router();

function isStrongEnoughPassword(password: string): boolean {
  return password.length >= 8;
}

function normalizeUsername(value: string): string {
  return value.trim();
}

function isValidUsername(value: string): boolean {
  return value.length > 0 && value.length <= 12;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const arr = value
    .filter((x) => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // refuse mixed/invalid arrays
  if (arr.length !== value.length) return null;
  return arr;
}

type LoginRateBucket = {
  attempts: number[];
  blockedUntil: number;
};

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const LOGIN_RATE_WINDOW_MS = readPositiveIntEnv('LOGIN_RATE_WINDOW_MS', 15 * 60_000);
const LOGIN_RATE_MAX_ATTEMPTS = readPositiveIntEnv('LOGIN_RATE_MAX_ATTEMPTS', 10);
const LOGIN_RATE_BLOCK_MS = readPositiveIntEnv('LOGIN_RATE_BLOCK_MS', 15 * 60_000);

const loginRateByIp = new Map<string, LoginRateBucket>();
const loginRateByIdentifier = new Map<string, LoginRateBucket>();

function normalizeIp(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

function getClientIp(req: Request): string {
  if (typeof req.ip === 'string' && req.ip.trim()) {
    return normalizeIp(req.ip);
  }

  if (typeof req.socket.remoteAddress === 'string' && req.socket.remoteAddress.trim()) {
    return normalizeIp(req.socket.remoteAddress);
  }

  return 'unknown';
}

function getBucket(map: Map<string, LoginRateBucket>, key: string): LoginRateBucket {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { attempts: [], blockedUntil: 0 };
    map.set(key, bucket);
  }
  return bucket;
}

function pruneBucket(bucket: LoginRateBucket, now: number): void {
  const minTs = now - LOGIN_RATE_WINDOW_MS;
  bucket.attempts = bucket.attempts.filter((ts) => ts >= minTs);
  if (bucket.blockedUntil <= now) {
    bucket.blockedUntil = 0;
  }
}

function getRetryAfterMs(map: Map<string, LoginRateBucket>, key: string, now: number): number {
  const bucket = map.get(key);
  if (!bucket) return 0;

  pruneBucket(bucket, now);
  return bucket.blockedUntil > now ? bucket.blockedUntil - now : 0;
}

function registerLoginFailure(map: Map<string, LoginRateBucket>, key: string, now: number): void {
  const bucket = getBucket(map, key);
  pruneBucket(bucket, now);
  bucket.attempts.push(now);

  if (bucket.attempts.length >= LOGIN_RATE_MAX_ATTEMPTS) {
    bucket.blockedUntil = now + LOGIN_RATE_BLOCK_MS;
    bucket.attempts = [];
  }
}

function clearLoginRate(map: Map<string, LoginRateBucket>, key: string): void {
  map.delete(key);
}

function ensureLoginRateLimit(req: Request, res: Response, identifier: string): boolean {
  const now = Date.now();
  const ipKey = getClientIp(req);
  const idKey = identifier.toLowerCase();

  const retryMs = Math.max(
    getRetryAfterMs(loginRateByIp, ipKey, now),
    getRetryAfterMs(loginRateByIdentifier, idKey, now)
  );

  if (retryMs <= 0) return true;

  const retryAfterSeconds = Math.max(1, Math.ceil(retryMs / 1000));
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).json({ error: 'Too many login attempts', retryAfterSeconds });
  return false;
}

function noteLoginFailure(req: Request, identifier: string): void {
  const now = Date.now();
  const ipKey = getClientIp(req);
  const idKey = identifier.toLowerCase();

  registerLoginFailure(loginRateByIp, ipKey, now);
  registerLoginFailure(loginRateByIdentifier, idKey, now);
}

function clearLoginFailures(req: Request, identifier: string): void {
  clearLoginRate(loginRateByIdentifier, identifier.toLowerCase());
  clearLoginRate(loginRateByIp, getClientIp(req));
}

/**
 * Register a new user.
 */
router.post(
  '/register',
  authMiddleware,
  requireGlobalPermission('users.manage'),
  async (req: Request, res: Response) => {
    try {
      const username = asNonEmptyString(req.body?.username);
      const password = asNonEmptyString(req.body?.password);
      const confirmPassword = asNonEmptyString(req.body?.confirmPassword);

      const globalPermissionsRaw = (req.body as any)?.globalPermissions;

      let globalPermissions: string[] | undefined = undefined;

      if (globalPermissionsRaw !== undefined) {
        const parsed = asStringArray(globalPermissionsRaw);

        if (parsed === null) {
          return res.status(400).json({ error: 'globalPermissions must be an array of strings' });
        }

        if (parsed.includes('*')) {
          return res.status(400).json({ error: 'Wildcard permission "*" is reserved for root' });
        }

        globalPermissions = parsed;
      }

      if (!username || !password || !confirmPassword) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const normalizedUsername = normalizeUsername(username);
      if (!isValidUsername(normalizedUsername)) {
        return res.status(400).json({ error: 'Username must be between 1 and 12 characters' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }

      if (!isStrongEnoughPassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existingByUsername = await userRepository.findByUsername(normalizedUsername);
      if (existingByUsername) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      const passwordHash = await hashPassword(password);

      // Create user (enabled by default)
      const userId = await userRepository.create(normalizedUsername, passwordHash, {
        globalPermissions,
      });

      const user = await userRepository.findById(userId!);
      if (!user) {
        return res.status(500).json({ error: 'Registration failed' });
      }

      return res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          isRoot: Boolean(user.is_root),
          isEnabled: Boolean(user.is_enabled),
          globalPermissions,
        },
      });
    } catch (error) {
      logError('ROUTE:AUTH:REGISTER', error);
      return res.status(500).json({ error: 'Registration failed' });
    }
  }
);

/**
 * Login with username + password.
 * Uses a generic error message to avoid leaking which part is invalid.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const identifier = asNonEmptyString(req.body?.username);
    const password = asNonEmptyString(req.body?.password);

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const normalizedIdentifier = normalizeUsername(identifier);
    if (!isValidUsername(normalizedIdentifier)) {
      return res.status(400).json({ error: 'Username must be between 1 and 12 characters' });
    }

    if (!ensureLoginRateLimit(req, res, normalizedIdentifier)) {
      return;
    }

    const user = await userRepository.findByUsername(normalizedIdentifier);
    if (!user) {
      noteLoginFailure(req, normalizedIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_enabled) {
      noteLoginFailure(req, normalizedIdentifier);
      return res.status(403).json({ error: 'Account disabled' });
    }

    const validPassword = await comparePasswords(password, user.password_hash);
    if (!validPassword) {
      noteLoginFailure(req, normalizedIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearLoginFailures(req, normalizedIdentifier);

    const token = generateToken({
      userId: user.id,
      username: user.username,
      isRoot: Boolean(user.is_root),
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        isRoot: Boolean(user.is_root),
        isEnabled: Boolean(user.is_enabled),
      },
      token,
    });
  } catch (error) {
    logError('ROUTE:AUTH:LOGIN', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Return the currently authenticated user.
 */
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await userRepository.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isRoot = Boolean(user.is_root);

    const globalPermissions = isRoot
      ? ['*']
      : await userRepository.getGlobalPermissions(userId);

    const serverRows = await serverMemberRepository.listByUser(userId);

    const serverPermissions = serverRows.map((r: any) => {
      let permissions: string[] = [];
      try {
        const parsed = JSON.parse(r.permissions_json ?? '[]');
        if (Array.isArray(parsed)) permissions = parsed.filter((x) => typeof x === 'string');
      } catch {
        // Keep an empty permission list if parsing fails.
      }

      return {
        serverId: r.server_id,
        permissions,
      };
    });

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        isRoot,
        isEnabled: Boolean(user.is_enabled),
      },
      permissions: {
        global: globalPermissions,
        servers: serverPermissions,
      },
    });
  } catch (error) {
    logError('ROUTE:AUTH:ME', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * Change the current user's password.
 */
router.post('/change-password', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentPassword = asNonEmptyString(req.body?.currentPassword);
    const newPassword = asNonEmptyString(req.body?.newPassword);
    const confirmPassword = asNonEmptyString(req.body?.confirmPassword);

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (!isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const user = await userRepository.findById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await comparePasswords(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(req.user!.userId, newPasswordHash);

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logError('ROUTE:AUTH:CHANGE_PASSWORD', error);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
