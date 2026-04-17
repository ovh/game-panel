import { Router, type Response } from 'express';
import { type AuthenticatedRequest, requireServerPermission, requireGlobalPermission } from '../middleware/auth.js';
import * as dockerUtils from '../utils/docker.js';
import {
  assertPortsAvailable,
  buildAndValidateOpenPortMappings,
  assertHostPortsAbove1024,
  collectHostPortsByProto,
  type PortsPayload,
  type PortLabelsPayload,
  NormalizedPortMappings,
  normalizePortLabelsForMappings
} from '../utils/ports.js';
import { bus } from '../realtime/bus.js';
import serverFileRoutes from './serverFile.js';
import serverFilesRoutes from './serverFiles.js';
import backupsRoutes from './backups.js';
import sftpRoutes from './sftp.js';
import terminalRoutes from './terminal.js';
import {
  getServerOrThrow,
  installServerAsync,
  deleteServerBestEffort
} from '../services/servers.js';
import {
  userRepository,
  serverMemberRepository,
  serverRepository,
  actionsRepository,
  installProgressRepository
} from '../database/index.js';
import {
  NormalizedHealthcheck,
  HealthcheckPayload,
  normalizeHealthcheckPayload
} from '../utils/docker/containers.js';
import { getGameUpdateCron, setGameUpdateCron } from '../services/gameUpdate.js';
import { parsePositiveIntId } from '../utils/ids.js';
import { logError } from '../utils/logger.js';
import type { GameServerRow } from '../types/gameServer.js';
import { nowIso } from '../utils/time.js';
import {
  beginServerTransition,
  clearServerTransition,
  completeServerTransition,
  POWER_TRANSITION_TIMEOUT_MS,
  RESTART_HEALTH_POLL_DELAY_MS,
  reconcileServerStatus,
} from '../services/serverTransitions.js';

const router = Router();

router.use('/:id/file', serverFileRoutes);
router.use('/:id/files', serverFilesRoutes);
router.use('/:id/backups', backupsRoutes);
router.use('/:id/sftp', sftpRoutes);
router.use('/:id/terminal', terminalRoutes);

export function parseServerId(raw: string): number | null {
  return parsePositiveIntId(raw);
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function assertExecSucceeded(
  result: { exitCode: number; stdout: string; stderr: string },
  action: 'start' | 'stop' | 'restart'
) {
  if (result.exitCode === 0) return;

  const details = [result.stderr, result.stdout]
    .map((chunk) => String(chunk || '').trim())
    .find(Boolean);

  throw new Error(
    details
      ? `Failed to ${action} server: ${details}`
      : `Failed to ${action} server (exit code ${result.exitCode})`
  );
}

/**
 * Returns all servers owned by the authenticated user.
 * Status is best-effort verified against Docker when a container exists.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const servers = await serverRepository.listAll();

    const serversWithInstall = await Promise.all(
      servers.map(async (server: GameServerRow) => {
        const installProgress = await installProgressRepository.getByServerId(server.id);

        return {
          ...server,
          install_progress: installProgress,
        };
      })
    );

    res.json({ servers: serversWithInstall });
  } catch (error) {
    logError('ROUTE:SERVERS:LIST', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

/**
 * Returns a single server by ID
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const serverId = parseServerId(req.params.id);
    if (!serverId) {
      return res.status(400).json({ error: 'Invalid server id' });
    }

    const server = await serverRepository.findById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    res.json({ server });
  } catch (error) {
    logError('ROUTE:SERVERS:GET', error);
    res.status(500).json({ error: 'Failed to fetch server' });
  }
}
);

/**
 * Creates a new server record and starts the installation asynchronously.
 * Installation progress is pushed over WebSocket.
 */
router.post(
  '/install',
  requireGlobalPermission('server.install'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        gameKey,
        serverName,
        gameServerName,
        ports,
        portLabels,
        healthcheck,
        requireSteamCredentials,
        steamUsername,
        steamPassword,
      } = req.body as {
        gameKey?: string;
        serverName?: string;
        gameServerName?: string;
        ports?: PortsPayload;
        portLabels?: PortLabelsPayload;
        healthcheck?: HealthcheckPayload;
        requireSteamCredentials?: boolean | string | null;
        steamUsername?: string | null;
        steamPassword?: string | null;
      };

      if (!gameKey || !serverName || !ports || !gameServerName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const existing = await serverRepository.findByName(serverName);
      if (existing) {
        return res.status(400).json({ error: 'Server name already exists' });
      }

      const dockerImage = `gameservermanagers/gameserver:${gameKey}`;

      const useSteamCredentials = parseOptionalBoolean(requireSteamCredentials);
      if (useSteamCredentials === null) {
        return res.status(400).json({ error: 'requireSteamCredentials must be a boolean' });
      }

      const rawSteamUsername = asOptionalString(steamUsername);
      const rawSteamPassword = asOptionalString(steamPassword);

      let normalizedSteamCredentials: { username: string; password: string } | null = null;
      if (useSteamCredentials) {
        const username = rawSteamUsername?.trim() ?? '';
        const password = rawSteamPassword ?? '';
        if (!username) {
          return res.status(400).json({ error: 'steamUsername is required when requireSteamCredentials is true' });
        }
        if (!password.trim()) {
          return res.status(400).json({ error: 'steamPassword is required when requireSteamCredentials is true' });
        }
        normalizedSteamCredentials = { username, password };
      }

      let normalizedHealthcheck: NormalizedHealthcheck | null = null;
      try {
        normalizedHealthcheck = normalizeHealthcheckPayload(healthcheck);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid healthcheck payload';
        return res.status(400).json({ error: msg });
      }

      let mappings: NormalizedPortMappings;
      try {
        mappings = buildAndValidateOpenPortMappings({ portsPayload: ports }).mappings;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid ports payload';
        return res.status(400).json({ error: msg });
      }

      try {
        assertHostPortsAbove1024(collectHostPortsByProto(mappings));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid port range';
        return res.status(400).json({ error: msg });
      }

      try {
        await assertPortsAvailable(collectHostPortsByProto(mappings));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Port check failed';
        return res.status(409).json({ error: msg });
      }

      let normalizedPortLabels: { tcp: Record<string, string>; udp: Record<string, string> };
      try {
        normalizedPortLabels = normalizePortLabelsForMappings({
          portLabelsPayload: portLabels,
          mappings,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid port labels payload';
        return res.status(400).json({ error: msg });
      }

      const serverId = await serverRepository.create(
        serverName,
        gameKey,
        gameServerName,
        dockerImage,
        mappings,
        normalizedPortLabels,
        normalizedHealthcheck
          ? normalizedHealthcheck.type === 'tcp_connect'
            ? { type: 'tcp_connect', port: normalizedHealthcheck.port }
            : { type: 'process', name: normalizedHealthcheck.name }
          : { type: 'default' },
        'installing'
      );

      await installProgressRepository.create(serverId);

      const requesterId = req.user!.userId;
      const requester = await userRepository.findById(requesterId);
      if (requester && !Boolean(requester.is_root)) {
        const existingMembership = await serverMemberRepository.find(serverId, requesterId);
        if (!existingMembership) {
          await serverMemberRepository.create(serverId, requesterId, ['*']);
        }
      }

      const server = await serverRepository.findById(serverId);
      bus.emit('server.created', { serverId, timestamp: nowIso() });

      installServerAsync(serverId, gameKey, gameServerName, serverName, mappings, {
        image: dockerImage,
        healthcheck: normalizedHealthcheck,
        steamCredentials: normalizedSteamCredentials,
      },
        req.user?.username
      ).catch((error) => {
        logError('ROUTE:SERVERS:INSTALL_ASYNC', error, { serverId });
      });

      return res.status(201).json({
        success: true,
        server,
        message: 'Installation started. Track progress via WebSocket.',
      });
    } catch (error) {
      logError('ROUTE:SERVERS:INSTALL', error);
      return res.status(500).json({ error: 'Failed to create server' });
    }
  }
);

/**
 * Patch a server (currently only supports renaming)
 */
router.patch(
  '/:id',
  requireServerPermission('server.edit'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serverId = parseServerId(req.params.id);
      if (!serverId) {
        return res.status(400).json({ error: 'Invalid server id' });
      }

      const raw = (req.body?.serverName ?? req.body?.name) as unknown;
      if (typeof raw !== 'string') {
        return res.status(400).json({ error: 'Missing field: serverName' });
      }

      const serverName = raw.trim();
      if (serverName.length < 3 || serverName.length > 50) {
        return res.status(400).json({ error: 'Server name must be between 3 and 50 characters' });
      }

      const server = await serverRepository.findById(serverId);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      if (server.name === serverName) {
        return res.status(200).json({ success: true, server });
      }

      const existing = await serverRepository.findByName(serverName);
      if (existing && existing.id !== serverId) {
        return res.status(409).json({ error: 'Server name already exists' });
      }

      await serverRepository.update(serverId, { name: serverName });

      const updated = await serverRepository.findById(serverId);

      bus.emit('server.updated', { serverId, timestamp: nowIso() });

      return res.status(200).json({ success: true, server: updated });
    } catch (error) {
      logError('ROUTE:SERVERS:RENAME', error);
      return res.status(500).json({ error: 'Failed to rename server' });
    }
  }
);

/**
 * Start a server using the game-specific "start" command.
 */
router.post(
  '/:id/start',
  requireServerPermission('server.power'),
  async (req: AuthenticatedRequest, res: Response) => {
    let serverId: number | null = null;

    try {
      serverId = parseServerId(req.params.id);
      if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

      const server = await getServerOrThrow(serverId);
      await beginServerTransition(serverId, 'starting', {
        timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
        timeoutBehavior: 'reconcile',
        pollDockerHealth: true,
      });

      const result = await dockerUtils.execShellCommand(
        server.docker_container_id,
        `/app/${server.game_server_name} start`
      );
      assertExecSucceeded(result, 'start');

      await actionsRepository.create(
        serverId,
        'info',
        'Server start initiated',
        req.user?.username || ""
      );

      res.json({ success: true, message: 'Server start initiated' });
    } catch (error) {
      if (serverId) {
        clearServerTransition(serverId);
        await reconcileServerStatus(serverId).catch((reconcileError) => {
          logError('ROUTE:SERVERS:START:RECONCILE', reconcileError, { serverId });
        });
      }
      logError('ROUTE:SERVERS:START', error);
      res.status(500).json({ error: 'Failed to start server' });
    }
  }
);

/**
 * Stops a server using the game-specific "stop" command.
 */
router.post(
  '/:id/stop',
  requireServerPermission('server.power'),
  async (req: AuthenticatedRequest, res: Response) => {
    let serverId: number | null = null;

    try {
      serverId = parseServerId(req.params.id);
      if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

      const server = await getServerOrThrow(serverId);
      await beginServerTransition(serverId, 'stopping', {
        timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
        timeoutBehavior: 'reconcile',
        pollDockerHealth: false,
      });

      const result = await dockerUtils.execShellCommand(
        server.docker_container_id,
        `/app/${server.game_server_name} stop`
      );
      assertExecSucceeded(result, 'stop');

      await completeServerTransition(serverId, 'stopped');
      await actionsRepository.create(serverId, 'info', 'Server stopped', req.user?.username || "");

      res.json({ success: true, message: 'Server stopped' });
    } catch (error) {
      if (serverId) {
        clearServerTransition(serverId);
        await reconcileServerStatus(serverId).catch((reconcileError) => {
          logError('ROUTE:SERVERS:STOP:RECONCILE', reconcileError, { serverId });
        });
      }
      logError('ROUTE:SERVERS:STOP', error);
      res.status(500).json({ error: 'Failed to stop server' });
    }
  }
);

/**
 * Restarts a server using the game-specific "restart" command.
 */
router.post(
  '/:id/restart',
  requireServerPermission('server.power'),
  async (req: AuthenticatedRequest, res: Response) => {
    let serverId: number | null = null;

    try {
      serverId = parseServerId(req.params.id);
      if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

      const server = await getServerOrThrow(serverId);
      await beginServerTransition(serverId, 'restarting', {
        timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
        timeoutBehavior: 'reconcile',
        pollDockerHealth: true,
        healthPollDelayMs: RESTART_HEALTH_POLL_DELAY_MS,
      });

      const result = await dockerUtils.execShellCommand(
        server.docker_container_id,
        `/app/${server.game_server_name} restart`
      );
      assertExecSucceeded(result, 'restart');

      await actionsRepository.create(
        serverId,
        'info',
        'Server restart initiated',
        req.user?.username || ""
      );

      res.json({ success: true, message: 'Server restart initiated' });
    } catch (error) {
      if (serverId) {
        clearServerTransition(serverId);
        await reconcileServerStatus(serverId).catch((reconcileError) => {
          logError('ROUTE:SERVERS:RESTART:RECONCILE', reconcileError, { serverId });
        });
      }
      logError('ROUTE:SERVERS:RESTART', error);
      res.status(500).json({ error: 'Failed to restart server' });
    }
  }
);

// GET /api/servers/:id/gameupdate/cron
router.get('/:id/gameupdate/cron', requireServerPermission('server.gamesettings.write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const serverId = parseServerId(req.params.id);
    if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

    const state = await getGameUpdateCron(serverId);
    return res.json(state);
  } catch (error) {
    const statusCode = (error as any)?.statusCode ?? 500;
    const message = statusCode >= 500
      ? 'Failed to read auto-update cron'
      : (error instanceof Error ? error.message : 'Failed to read auto-update cron');
    if (statusCode >= 500) logError('ROUTE:SERVERS:GAMEUPDATE_CRON_READ', error, { serverId: req.params.id });
    return res.status(statusCode).json({ error: message });
  }
});

// POST /api/servers/:id/gameupdate/cron
router.post('/:id/gameupdate/cron', requireServerPermission('server.gamesettings.write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const serverId = parseServerId(req.params.id);
    if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

    const enabled = Boolean(req.body?.enabled);
    await setGameUpdateCron(serverId, { enabled });

    const fresh = await getGameUpdateCron(serverId);
    return res.json(fresh);
  } catch (error) {
    const statusCode = (error as any)?.statusCode ?? 500;
    const message = statusCode >= 500
      ? 'Failed to update auto-update cron'
      : (error instanceof Error ? error.message : 'Failed to update auto-update cron');
    if (statusCode >= 500) logError('ROUTE:SERVERS:GAMEUPDATE_CRON_WRITE', error, { serverId: req.params.id });
    return res.status(statusCode).json({ error: message });
  }
});

/**
 * Deletes a server, its Docker container, data directory and SFTP user (best effort).
 */
router.delete(
  '/:id',
  requireServerPermission('server.delete'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serverId = parseServerId(req.params.id);
      if (!serverId) return res.status(400).json({ error: 'Invalid server id' });

      await deleteServerBestEffort(serverId);

      return res.json({ success: true, message: 'Server deleted' });
    } catch (error) {
      const statusCode = (error as any)?.statusCode ?? 500;
      const message = statusCode >= 500
        ? 'Failed to delete server'
        : (error instanceof Error ? error.message : 'Failed to delete server');

      if (statusCode >= 500) {
        logError('ROUTE:SERVERS:DELETE', error, { serverId: req.params.id });
      }

      return res.status(statusCode).json({ error: message });
    }
  }
);

export default router;
