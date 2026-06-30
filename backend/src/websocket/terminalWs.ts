import type { AuthenticatedWebSocket, WsTerminalMessage } from './types.js';
import {
    attachTerminalSession,
    detachTerminalSessionsForWs,
    getTerminalSession,
    onTerminalData,
    resizeTerminal,
    writeToTerminal,
} from './terminalManager.js';
import { serverMemberRepository } from '../database/index.js';
import { PERMISSIONS } from '../permissions.js';
import { sendSafe } from './auth.js';

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
    if (!isOwnerOrRoot(ws, session)) {
        sendSafe(ws, { type: 'terminal:error', error: 'forbidden' });
        return false;
    }

    const serverId = Number(session?.serverId ?? 0);
    if (serverId) {
        const ok = await hasTerminalPermission(ws, serverId, PERMISSIONS.container.terminal);
        if (!ok) {
            sendSafe(ws, { type: 'terminal:error', error: 'insufficient_permissions' });
            return false;
        }
    }

    return true;
}

export async function handleTerminalWsMessage(ws: AuthenticatedWebSocket, msg: WsTerminalMessage): Promise<void> {
    // msg.type: terminal:attach | terminal:input | terminal:resize
    if (!ws.userId) {
        sendSafe(ws, { type: 'terminal:error', error: 'unauthorized' });
        return;
    }

    if (msg.type === 'terminal:attach') {
        const sessionId = String(msg.sessionId ?? '');
        if (!sessionId) {
            sendSafe(ws, { type: 'terminal:error', error: 'missing sessionId' });
            return;
        }

        const session = getTerminalSession(sessionId);
        if (!session) {
            sendSafe(ws, { type: 'terminal:error', error: 'unknown session' });
            return;
        }

        // Ownership gate (or root)
        if (!(await assertTerminalAccess(ws, session))) return;

        const wsClientId = ws.gpClientId;
        if (!wsClientId) {
            sendSafe(ws, { type: 'terminal:error', error: 'missing_client_id' });
            return;
        }
        attachTerminalSession(sessionId, wsClientId);

        const unsubscribe = onTerminalData(sessionId, (chunk) => {
            sendSafe(ws, {
                type: 'terminal:output',
                sessionId,
                dataB64: chunk.toString('base64'),
            });
        });

        ws.terminalSubs ??= {};
        ws.terminalSubs[sessionId]?.();
        ws.terminalSubs[sessionId] = unsubscribe;

        sendSafe(ws, { type: 'terminal:attached', sessionId });

        return;
    }

    if (msg.type === 'terminal:input') {
        const sessionId = String(msg.sessionId ?? '');
        const dataB64 = String(msg.dataB64 ?? '');
        if (!sessionId || !dataB64) return;

        const session = getTerminalSession(sessionId);
        if (!session) {
            sendSafe(ws, { type: 'terminal:closed', sessionId });
            return;
        }

        // Ownership check here too
        if (!(await assertTerminalAccess(ws, session))) return;

        const buf = Buffer.from(dataB64, 'base64');
        try {
            writeToTerminal(sessionId, buf);
        } catch {
            sendSafe(ws, { type: 'terminal:closed', sessionId });
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

    const wsClientId = ws.gpClientId;
    if (wsClientId) detachTerminalSessionsForWs(wsClientId);
}
