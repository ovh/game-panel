import type { NextFunction, Request, Response } from 'express';
import type { JWTPayload } from '../utils/auth.js';
import { extractTokenFromHeader, verifyToken } from '../utils/auth.js';
import { userRepository, serverMemberRepository } from '../database/index.js';
import { parsePositiveIntId } from '../utils/ids.js';
import { logError } from '../utils/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

/**
 * Auth middleware:
 * - Extracts the Bearer token from the Authorization header
 * - Verifies the JWT
 * - Verifies user still exists and is enabled
 * - Attaches the decoded payload to req.user
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = verifyToken(token);

    const user = await userRepository.findById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    if (!user.is_enabled) {
      res.status(403).json({ error: 'Account disabled' });
      return;
    }

    req.user = { ...payload, isRoot: Boolean(user.is_root) };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Root-only guard. Requires authMiddleware before it.
 */
export function rootOnly(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.isRoot) {
    res.status(403).json({ error: 'Root access required' });
    return;
  }
  next();
}

/**
 * Global permission guard (panel-wide), e.g. "users.manage".
 */
export function requireGlobalPermission(perm: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Root bypass
      if (req.user.isRoot) {
        next();
        return;
      }

      const perms = await userRepository.getGlobalPermissions(req.user.userId);

      if (perms.includes('*') || perms.includes(perm)) {
        next();
        return;
      }

      res.status(403).json({ error: 'Insufficient permissions' });
    } catch (err) {
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

export function requireServerPermission(permission: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Root bypass
      if (req.user.isRoot) {
        return next();
      }

      const serverId = parsePositiveIntId(req.params.id);
      if (!serverId) {
        return res.status(400).json({ error: 'Invalid server id' });
      }

      const permissions = await serverMemberRepository.getUserServerPermissions(
        serverId,
        req.user.userId
      );

      if (permissions.includes('*') || permissions.includes(permission)) {
        return next();
      }

      return res.status(403).json({ error: 'Insufficient server permissions' });
    } catch (err) {
      return res.status(500).json({ error: 'Server authorization failed' });
    }
  };
}

type HttpError = Error & {
  status?: number;
  name?: string;
};

function toHttpError(error: unknown): HttpError {
  if (error instanceof Error) return error as HttpError;
  return new Error('Unknown error');
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const err = toHttpError(error);
  logError('MIDDLEWARE:ERROR_HANDLER', err);

  switch (err.name) {
    case 'ValidationError':
      res.status(400).json({ error: err.message });
      return;

    case 'UnauthorizedError':
      res.status(401).json({ error: 'Unauthorized' });
      return;

    case 'NotFoundError':
      res.status(404).json({ error: 'Not found' });
      return;

    default:
      {
        const statusCode = err.status ?? (err as any).statusCode ?? 500;
        const safeMessage = statusCode >= 500 ? 'Internal server error' : err.message || 'Request failed';
        res.status(statusCode).json({ error: safeMessage });
      }
  }
}
