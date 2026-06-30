import type { IncomingMessage } from 'http';
import WebSocket from 'ws';

import { extractTokenFromHeader, verifyToken } from '../utils/auth.js';
import type { AuthenticatedWebSocket, OutgoingWebSocketMessage, WSMessage } from './types.js';

export function authenticateFromRequest(ws: AuthenticatedWebSocket, req: IncomingMessage): boolean {
    const tokenFromHeader = extractTokenFromHeader(req.headers.authorization);
    const token = tokenFromHeader;

    // Allow unauthenticated connections (client can authenticate later via WS message)
    if (!token) return true;

    try {
        const user = verifyToken(token);
        ws.userId = user.userId;
        ws.isRoot = Boolean(user.isRoot);
        ws.tokenVersion = user.tokenVersion;
        return true;
    } catch {
        ws.close(1008, 'Invalid token');
        return false;
    }
}

export function authenticateFromMessage(ws: AuthenticatedWebSocket, message: WSMessage): boolean {
    if (message.type !== 'auth' || typeof message.token !== 'string') {
        sendSafe(ws, { type: 'error', error: 'Unauthorized' });
        return false;
    }

    try {
        const user = verifyToken(message.token);
        ws.userId = user.userId;
        ws.isRoot = Boolean(user.isRoot);
        ws.tokenVersion = user.tokenVersion;
        return true;
    } catch {
        sendSafe(ws, { type: 'error', error: 'Invalid token' });
        ws.close(1008, 'Invalid token');
        return false;
    }
}

export function sendSafe(ws: WebSocket, payload: OutgoingWebSocketMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
        ws.send(JSON.stringify(payload));
    } catch {
        // Ignore send errors when the client disconnects mid-flight.
    }
}
