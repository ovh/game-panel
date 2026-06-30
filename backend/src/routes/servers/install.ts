import { Router, type Response } from 'express';
import {
    type AuthenticatedRequest,
    requireGlobalPermission,
} from '../../middleware/auth.js';
import {
    installProgressRepository,
    serverMemberRepository,
    serverRepository,
    userRepository,
} from '../../database/index.js';
import { bus } from '../../realtime/bus.js';
import { resolveInstallSpec } from '../../providers/installSpec.js';
import type { ResolvedInstallSpec } from '../../providers/installTypes.js';
import { normalizeServerProvider } from '../../providers/types.js';
import { installServerAsync } from '../../services/servers.js';
import { assertHostPortsAvailableForServer } from '../../services/hostPortAvailability.js';
import {
    assertHostPortsAbove1024,
    buildAndValidateOpenPortMappings,
    collectHostPortsByProto,
    type NormalizedPorts,
    type PortsPayload,
} from '../../utils/ports.js';
import {
    normalizeHealthcheckPayload,
    type HealthcheckPayload,
    type NormalizedHealthcheck,
} from '../../utils/healthcheck.js';
import {
    normalizeResourceLimitsPayload,
    type NormalizedResourceLimits,
} from '../../utils/resourceLimits.js';
import { logError } from '../../utils/logger.js';
import { nowIso } from '../../utils/time.js';
import { serializeGameServer } from '../../utils/apiSerialization.js';
import { getErrorStatusCode, sendRouteError } from '../../utils/routeErrors.js';
import { PERMISSIONS } from '../../permissions.js';
import { optionalTrimmedString, requireBodyObject } from '../../utils/httpValidation.js';
import {
    asOptionalString,
    isValidServerName,
    loadServerAfterMutation,
    parseOptionalBoolean,
} from './shared.js';

export function createServerInstallRoutes(): Router {
    const router = Router();

    // POST /api/servers/install
    router.post(
        '/install',
        requireGlobalPermission(PERMISSIONS.server.install),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const body = requireBodyObject(req.body);
                const rawProvider = typeof body.provider === 'string' ? body.provider : undefined;
                const name = optionalTrimmedString(body.name);
                const ports = body.ports as PortsPayload | undefined;
                const healthcheck = body.healthcheck as HealthcheckPayload | undefined;
                const resourceLimits = body.resourceLimits;

                const provider = normalizeServerProvider(rawProvider);
                if (!provider) {
                    return res.status(400).json({ error: 'Missing or invalid provider' });
                }

                if (!name) {
                    return res.status(400).json({ error: 'Missing required fields' });
                }

                if (!isValidServerName(name)) {
                    return res.status(400).json({ error: 'Server name must be between 3 and 50 characters' });
                }

                const existing = await serverRepository.findByName(name);
                if (existing) {
                    return res.status(400).json({ error: 'Server name already exists' });
                }

                const useSteamCredentials = parseOptionalBoolean(body.requireSteamCredentials);
                if (useSteamCredentials === null) {
                    return res.status(400).json({ error: 'requireSteamCredentials must be a boolean' });
                }

                const rawSteamUsername = asOptionalString(body.steamUsername);
                const rawSteamPassword = asOptionalString(body.steamPassword);

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

                let normalizedResourceLimits: NormalizedResourceLimits = null;
                try {
                    normalizedResourceLimits = normalizeResourceLimitsPayload(resourceLimits);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Invalid resourceLimits payload';
                    return res.status(400).json({ error: msg });
                }

                let normalizedPorts: NormalizedPorts;
                try {
                    normalizedPorts = buildAndValidateOpenPortMappings({ portsPayload: ports }).ports;
                } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Invalid ports payload';
                    return res.status(400).json({ error: msg });
                }

                try {
                    assertHostPortsAbove1024(collectHostPortsByProto(normalizedPorts));
                } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Invalid port range';
                    return res.status(400).json({ error: msg });
                }

                try {
                    await assertHostPortsAvailableForServer({ ports: normalizedPorts });
                } catch (e) {
                    const statusCode = getErrorStatusCode(e);
                    if (statusCode >= 500) {
                        throw Object.assign(new Error('Port check failed'), { statusCode, cause: e });
                    }

                    const msg = e instanceof Error ? e.message : 'Port check failed';
                    return res.status(statusCode).json({ error: msg });
                }

                let installSpec: ResolvedInstallSpec;
                try {
                    installSpec = await resolveInstallSpec({
                        provider,
                        body,
                        ports: normalizedPorts,
                        healthcheck: normalizedHealthcheck,
                        resourceLimits: normalizedResourceLimits,
                        steamCredentials: normalizedSteamCredentials,
                    });
                } catch (e: any) {
                    const statusCode = getErrorStatusCode(e, 400);
                    return res.status(statusCode).json({ error: e instanceof Error ? e.message : 'Invalid install payload' });
                }

                const serverId = await serverRepository.create({
                    name,
                    provider: installSpec.provider,
                    catalogId: installSpec.catalogId,
                    dockerImage: installSpec.dockerImage,
                    ports: normalizedPorts,
                    healthcheck: normalizedHealthcheck,
                    resourceLimits: normalizedResourceLimits,
                    mounts: installSpec.mounts,
                    env: installSpec.env,
                    runtimeConfig: installSpec.runtimeConfig,
                    providerMetadata: installSpec.providerMetadata,
                    initialStatus: 'creating',
                    desiredState: 'running',
                });

                await installProgressRepository.create(serverId);

                const requesterId = req.user!.userId;
                const requester = await userRepository.findById(requesterId);
                if (requester && !Boolean(requester.is_root)) {
                    const existingMembership = await serverMemberRepository.find(serverId, requesterId);
                    if (!existingMembership) {
                        await serverMemberRepository.create(serverId, requesterId, ['*']);
                    }
                }

                const server = await loadServerAfterMutation(serverId, 'install');
                bus.emit('server.created', { serverId, timestamp: nowIso() });

                installServerAsync(serverId, name, installSpec, req.user?.username).catch((error) => {
                    logError('ROUTE:SERVERS:INSTALL_ASYNC', error, { serverId });
                });

                return res.status(201).json({
                    success: true,
                    server: serializeGameServer(server),
                    message: 'Installation started. Track progress via WebSocket.',
                });
            } catch (error) {
                return sendRouteError(res, error, {
                    route: 'ROUTE:SERVERS:INSTALL',
                    fallbackMessage: 'Failed to create server',
                });
            }
        }
    );

    return router;
}
