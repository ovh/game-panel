import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';

const TOKEN_EXPIRY = '120h';
const BCRYPT_SALT_ROUNDS = 10;

function jwtSecret(): string {
  return getConfig().jwtSecret;
}

/**
 * Shape of the JWT payload used across the application.
 *
 * Notes:
 * - "isRoot" allows an early bypass in authz middleware.
 */
export interface JWTPayload {
  userId: number;
  username: string;
  isRoot: boolean;
}

/* -------------------------------------------------------------------------- */
/*                               Password utils                               */
/* -------------------------------------------------------------------------- */

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/* -------------------------------------------------------------------------- */
/*                                 JWT utils                                  */
/* -------------------------------------------------------------------------- */

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JWTPayload {
  const decoded = jwt.verify(token, jwtSecret());

  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload');
  }

  // Very small runtime guard (helps when you deploy with old tokens still around)
  const d = decoded as Partial<JWTPayload>;
  if (
    typeof d.userId !== 'number' ||
    typeof d.username !== 'string' ||
    typeof d.isRoot !== 'boolean'
  ) {
    throw new Error('Invalid token payload shape');
  }

  return d as JWTPayload;
}

export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');

  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}
