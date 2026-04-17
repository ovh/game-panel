import type { IncomingMessage } from 'http';
import WebSocket from 'ws';

import { extractTokenFromHeader, verifyToken } from '../utils/auth.js';
import type { AuthenticatedWebSocket, WSMessage } from './types.js';

/**
 * Best-effort authentication at connection time:
 * - Authorization header (Bearer token)
 *
 * Returns `false` only if a token was provided but invalid.
 */
export function authenticateFromRequest(ws: AuthenticatedWebSocket, req: IncomingMessage): boolean {
    const tokenFromHeader = extractTokenFromHeader(req.headers.authorization);
    const token = tokenFromHeader;

    // Allow unauthenticated connections (client can authenticate later via WS message)
    if (!token) return true;

    try {
        const user = verifyToken(token);
        ws.userId = user.userId;
        ws.isRoot = Boolean(user.isRoot);
        return true;
    } catch {
        ws.close(1008, 'Invalid token');
        return false;
    }
}

/**
 * Auth during WS messaging (when a client connected without a token).
 * Returns true if authenticated successfully.
 */
export function authenticateFromMessage(ws: AuthenticatedWebSocket, message: WSMessage): boolean {
    const token = (message as any)?.data?.token || (message as any)?.token;

    if (message.type !== 'auth' || typeof token !== 'string') {
        sendSafe(ws, { type: 'error', error: 'Unauthorized' });
        return false;
    }

    try {
        const user = verifyToken(token);
        ws.userId = user.userId;
        ws.isRoot = Boolean(user.isRoot);
        return true;
    } catch {
        sendSafe(ws, { type: 'error', error: 'Invalid token' });
        ws.close(1008, 'Invalid token');
        return false;
    }
}

/**
 * Safe JSON send helper used across websocket modules.
 */
export function sendSafe(ws: WebSocket, payload: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
        ws.send(JSON.stringify(payload));
    } catch {
        // Ignore send errors when the client disconnects mid-flight.
    }
}
