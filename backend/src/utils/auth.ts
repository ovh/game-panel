import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';

const TOKEN_EXPIRY = '120h';
const BCRYPT_SALT_ROUNDS = 10;

function jwtSecret(): string {
  return getConfig().jwtSecret;
}

export interface JWTPayload {
  userId: number;
  username: string;
  isRoot: boolean;
  tokenVersion: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: TOKEN_EXPIRY, algorithm: 'HS256' });
}

export function verifyToken(token: string): JWTPayload {
  const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });

  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload');
  }

  const d = decoded as Partial<JWTPayload>;
  if (
    typeof d.userId !== 'number' ||
    typeof d.username !== 'string' ||
    typeof d.isRoot !== 'boolean' ||
    typeof d.tokenVersion !== 'number'
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
