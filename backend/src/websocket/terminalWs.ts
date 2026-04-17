import { AuthenticatedWebSocket } from './types.js';
import {
    attachTerminalSession,
    captureConsoleSessionScrollback,
    detachTerminalSessionsForWs,
    getTerminalSession,
    onTerminalData,
    resizeTerminal,
    writeToTerminal,
} from './terminalManager.js';
import WebSocket from 'ws';
import { serverMemberRepository } from '../database/index.js';

function safeJsonSend(ws: AuthenticatedWebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendTerminalOutputChunked(
    ws: AuthenticatedWebSocket,
    sessionId: string,
    payload: Buffer,
    chunkSize = 24 * 1024
): void {
    if (!payload.length) return;

    for (let offset = 0; offset < payload.length; offset += chunkSize) {
        const chunk = payload.subarray(offset, Math.min(offset + chunkSize, payload.length));
        safeJsonSend(ws, {
            type: 'terminal:output',
            sessionId,
            dataB64: chunk.toString('base64'),
        });
    }
}

async function hasTerminalPermission(ws: AuthenticatedWebSocket, serverId: number, perm: string): Promise<boolean> {
    if (ws.isRoot) return true;
    if (!ws.userId) return false;
    const perms = await serverMemberRepository.getUserServerPermissions(serverId, ws.userId);
    return perms.includes('*') || perms.includes(perm);
}

function isOwnerOrRoot(ws: AuthenticatedWebSocket, session: any): boolean {
    if (ws.isRoot) return true;
    return session?.ownerUserId === ws.userId;
}

async function assertTerminalAccess(
    ws: AuthenticatedWebSocket,
    session: any
): Promise<boolean> {
    const isConsoleSession = session?.kind === 'console';

    if (!isConsoleSession && !isOwnerOrRoot(ws, session)) {
        safeJsonSend(ws, { type: 'terminal:error', error: 'forbidden' });
        return false;
    }

    const serverId = Number(session?.serverId ?? 0);
    if (serverId) {
        const perm = session?.kind === 'console' ? 'server.console' : 'ssh.terminal';
        const ok = await hasTerminalPermission(ws, serverId, perm);
        if (!ok) {
            safeJsonSend(ws, { type: 'terminal:error', error: 'insufficient_permissions' });
            return false;
        }
    }

    return true;
}

export async function handleTerminalWsMessage(ws: AuthenticatedWebSocket, msg: any): Promise<void> {
    // msg.type: terminal:attach | terminal:input | terminal:resize
    if (!ws.userId) {
        safeJsonSend(ws, { type: 'terminal:error', error: 'unauthorized' });
        return;
    }

    if (msg.type === 'terminal:attach') {
        const sessionId = String(msg.sessionId ?? '');
        if (!sessionId) {
            safeJsonSend(ws, { type: 'terminal:error', error: 'missing sessionId' });
            return;
        }

        const session = getTerminalSession(sessionId);
        if (!session) {
            safeJsonSend(ws, { type: 'terminal:error', error: 'unknown session' });
            return;
        }

        // Ownership gate (or root)
        if (!(await assertTerminalAccess(ws, session))) return;

        const wsClientId = (ws as any)._gpClientId as string;
        attachTerminalSession(sessionId, wsClientId);

        const unsubscribe = onTerminalData(sessionId, (chunk) => {
            safeJsonSend(ws, {
                type: 'terminal:output',
                sessionId,
                dataB64: chunk.toString('base64'),
            });
        });

        ws.terminalSubs ??= {};
        ws.terminalSubs[sessionId]?.();
        ws.terminalSubs[sessionId] = unsubscribe;

        safeJsonSend(ws, { type: 'terminal:attached', sessionId });

        if (session.kind === 'console') {
            captureConsoleSessionScrollback(sessionId, {
                maxLines: 1200,
                maxBytes: 256 * 1024,
            })
                .then((scrollback) => {
                    if (!scrollback.length) return;
                    if (!getTerminalSession(sessionId)) return;
                    sendTerminalOutputChunked(ws, sessionId, scrollback);
                })
                .catch(() => {
                    // Ignore history replay failures; live stream remains available.
                });
        }

        return;
    }

    if (msg.type === 'terminal:input') {
        const sessionId = String(msg.sessionId ?? '');
        const dataB64 = String(msg.dataB64 ?? '');
        if (!sessionId || !dataB64) return;

        const session = getTerminalSession(sessionId);
        if (!session) {
            safeJsonSend(ws, { type: 'terminal:closed', sessionId });
            return;
        }

        // Ownership check here too
        if (!(await assertTerminalAccess(ws, session))) return;

        const buf = Buffer.from(dataB64, 'base64');
        try {
            writeToTerminal(sessionId, buf);
        } catch {
            safeJsonSend(ws, { type: 'terminal:closed', sessionId });
        }
        return;
    }

    if (msg.type === 'terminal:resize') {
        const sessionId = String(msg.sessionId ?? '');
        const cols = Number(msg.cols ?? 0);
        const rows = Number(msg.rows ?? 0);
        if (!sessionId || !cols || !rows) return;

        const session = getTerminalSession(sessionId);
        if (!session) return;

        // Ownership check here too
        if (!(await assertTerminalAccess(ws, session))) return;

        resizeTerminal(sessionId, { cols, rows }).catch(() => { });
        return;
    }
}

export function cleanupTerminalWs(ws: AuthenticatedWebSocket): void {
    if (ws.terminalSubs) {
        for (const unsub of Object.values(ws.terminalSubs)) {
            try {
                unsub();
            } catch { }
        }
        ws.terminalSubs = {};
    }

    const wsClientId = (ws as any)._gpClientId as string;
    if (wsClientId) detachTerminalSessionsForWs(wsClientId);
}
