import type { IncomingMessage } from 'http';
import { WebSocketServer, type RawData } from 'ws';
import crypto from 'node:crypto';
import { handleTerminalWsMessage, cleanupTerminalWs } from './terminalWs.js';
import type { AuthenticatedWebSocket, WSMessage } from './types.js';
import { parseIncomingWebSocketMessage } from './incoming.js';
import { authenticateFromMessage, authenticateFromRequest, sendSafe } from './auth.js';
import { attachBroadcaster } from './broadcaster.js';
import {
  cleanupClient,
  ensureSubs,
  handleSubscribeInstall,
  handleSubscribeLogs,
  handleSubscribeActions,
  handleSubscribeMetrics,
  handleSubscribeServers,
  handleSubscribeSystemMetrics,
  handleUnsubscribe,
  handleSubscribeFileTransfers,
} from './subscriptions.js';
import { userRepository, serverMemberRepository } from '../database/index.js';
import { startSystemMetricsPoller } from './pollers/systemMetricsPoller.js';
import { startServerMetricsPoller } from './pollers/serverMetricsPoller.js';
import { logError } from '../utils/logger.js';
import { PERMISSIONS } from '../permissions.js';

const WS_AUTH_TIMEOUT_MS = 3_000;
const WS_ACCOUNT_VALIDATION_TTL_MS = 5_000;

async function ensureWsUserEnabled(ws: AuthenticatedWebSocket): Promise<boolean> {
  if (!ws.userId) return false;

  const now = Date.now();
  if (
    typeof ws.accountValidatedAt === 'number' &&
    now - ws.accountValidatedAt < WS_ACCOUNT_VALIDATION_TTL_MS
  ) {
    return true;
  }

  const user = await userRepository.findById(ws.userId);
  if (!user) {
    sendSafe(ws, { type: 'error', error: 'Unauthorized' });
    ws.close(1008, 'Unauthorized');
    return false;
  }

  if (!user.is_enabled) {
    sendSafe(ws, { type: 'error', error: 'Account disabled' });
    ws.close(1008, 'Account disabled');
    return false;
  }

  if (ws.tokenVersion !== user.token_version) {
    sendSafe(ws, { type: 'error', error: 'Unauthorized' });
    ws.close(1008, 'Unauthorized');
    return false;
  }

  ws.isRoot = Boolean(user.is_root);
  ws.accountValidatedAt = now;
  return true;
}

async function hasServerPermission(
  ws: AuthenticatedWebSocket,
  serverId: number,
  perm: string
): Promise<boolean> {
  if (ws.isRoot) return true;
  if (!ws.userId) return false;

  const perms = await serverMemberRepository.getUserServerPermissions(serverId, ws.userId);
  return perms.includes('*') || perms.includes(perm);
}

export function setupWebSocket(wss: WebSocketServer): void {
  const broadcaster = attachBroadcaster(wss);

  // Start global pollers once at boot
  const systemMetricsTimer = startSystemMetricsPoller(wss, { intervalMs: 10_000 });
  const serverMetricsTimer = startServerMetricsPoller(wss, { intervalMs: 10_000 });

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as AuthenticatedWebSocket;

      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }

      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;

    if (!authenticateFromRequest(ws, req)) return;
    ensureSubs(ws);
    if (!ws.userId) {
      ws.authTimeout = setTimeout(() => {
        if (ws.userId) return;
        sendSafe(ws, { type: 'error', error: 'Authentication timeout' });
        ws.close(1008, 'Authentication timeout');
      }, WS_AUTH_TIMEOUT_MS);
    }

    ws.gpClientId = crypto.randomUUID();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data: RawData) => {
      try {
        const message = parseIncomingWebSocketMessage(data);
        await routeMessage(ws, message);
      } catch (error) {
        logError('WS:MESSAGE', error);
        sendSafe(ws, { type: 'error', error: 'Invalid message' });
      }
    });

    ws.on('close', () => {
      if (ws.authTimeout) {
        clearTimeout(ws.authTimeout);
        ws.authTimeout = undefined;
      }

      cleanupTerminalWs(ws);
      cleanupClient(ws);
    });

    ws.on('error', (error) => {
      logError('WS:CONNECTION', error);
    });
  });

  const shutdown = () => {
    clearInterval(heartbeatInterval);
    clearInterval(systemMetricsTimer);
    clearInterval(serverMetricsTimer);

    try {
      broadcaster.shutdown();
    } catch {
      // Ignore shutdown cleanup errors.
    }

    try {
      wss.close();
    } catch {
      // Ignore shutdown cleanup errors.
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function routeMessage(
  ws: AuthenticatedWebSocket,
  message: WSMessage
): Promise<void> {
  // If not authenticated yet, only auth messages can authenticate
  if (!ws.userId) {
    if (!authenticateFromMessage(ws, message)) return;
    if (ws.authTimeout) {
      clearTimeout(ws.authTimeout);
      ws.authTimeout = undefined;
    }
    sendSafe(ws, { type: 'auth:success' });
    return;
  }

  // Validate account state once per socket to reject disabled/deleted users.
  if (!(await ensureWsUserEnabled(ws))) return;

  switch (message.type) {
    // Some clients may still send auth even if already authed via headers.
    // Return a success ack to keep auth handshakes idempotent.
    case 'auth':
      sendSafe(ws, { type: 'auth:success' });
      return;

    // Terminal messages must be routed to terminalWs
    case 'terminal:attach':
    case 'terminal:input':
    case 'terminal:resize': {
      // Apply a permission check whenever a server ID is available in the payload.
      if (message.serverId) {
        const ok = await hasServerPermission(ws, message.serverId, PERMISSIONS.container.terminal);
        if (!ok) {
          sendSafe(ws, { type: 'error', error: 'Insufficient server permissions' });
          return;
        }
      }

      await handleTerminalWsMessage(ws, message);
      return;
    }

    case 'subscribe:servers':
      await handleSubscribeServers(ws, message);
      return;

    case 'subscribe:logs': {
      const ok = await hasServerPermission(ws, message.serverId, PERMISSIONS.container.logsRead);
      if (!ok) {
        sendSafe(ws, { type: 'error', error: 'Insufficient server permissions' });
        return;
      }

      await handleSubscribeLogs(ws, message.serverId, message);
      return;
    }

    case 'subscribe:actions': {
      await handleSubscribeActions(ws, message.serverId, message);
      return;
    }

    case 'subscribe:file-transfers': {
      const ok = await hasServerPermission(ws, message.serverId, PERMISSIONS.fs.read);
      if (!ok) {
        sendSafe(ws, { type: 'error', error: 'Insufficient server permissions' });
        return;
      }

      await handleSubscribeFileTransfers(ws, message.serverId, message);
      return;
    }

    case 'subscribe:metrics': {
      await handleSubscribeMetrics(ws, message.serverId, message);
      return;
    }

    case 'subscribe:system-metrics':
      await handleSubscribeSystemMetrics(ws, message);
      return;

    case 'subscribe:install': {
      await handleSubscribeInstall(ws, message.serverId);
      return;
    }

    case 'unsubscribe':
      await handleUnsubscribe(ws, message.channel, message.serverId);
      return;

    case 'ping':
      sendSafe(ws, { type: 'pong' });
      return;

    default:
      sendSafe(ws, { type: 'error', error: 'Unknown message type' });
  }
}
