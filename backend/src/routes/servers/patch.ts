import { Router, type Response } from 'express';
import {
    type AuthenticatedRequest,
    requireServerPermission,
    userHasServerPermission,
} from '../../middleware/auth.js';
import {
    actionsRepository,
    serverRepository,
} from '../../database/index.js';
import { bus } from '../../realtime/bus.js';
import { normalizeEnvPayload } from '../../providers/installPayload.js';
import { assertHostPortsAvailableForServer } from '../../services/hostPortAvailability.js';
import {
    reconfigureServerContainer,
    updateServerResourceLimits,
} from '../../services/serverReconfiguration.js';
import {
    assertHostPortsAbove1024,
    buildAndValidateOpenPortMappings,
    collectHostPortsByProto,
    type NormalizedPorts,
    type PortsPayload,
} from '../../utils/ports.js';
import {
    type HealthcheckPayload,
    normalizeHealthcheckPayload,
    type NormalizedHealthcheck,
} from '../../utils/healthcheck.js';
import {
    normalizeMountsPayload,
    type NormalizedMount,
} from '../../utils/mounts.js';
import {
    normalizeResourceLimitsPayload,
    type NormalizedResourceLimits,
} from '../../utils/resourceLimits.js';
import { nowIso } from '../../utils/time.js';
import type { GameServerRow } from '../../types/gameServer.js';
import { redactServerEnv, serializeGameServer } from '../../utils/apiSerialization.js';
import { getErrorStatusCode, sendRouteError } from '../../utils/routeErrors.js';
import { PERMISSIONS } from '../../permissions.js';
import { assertCanPatchServer } from '../../services/serverActionPolicy.js';
import { requireBodyObject } from '../../utils/httpValidation.js';
import {
    hasOwn,
    isValidServerName,
    loadServerAfterMutation,
    parseOptionalBoolean,
    parseServerId,
} from './shared.js';

export function createServerPatchRoutes(): Router {
    const router = Router();

    // PATCH /api/servers/:id
    router.patch(
        '/:id',
        requireServerPermission(PERMISSIONS.server.edit),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const serverId = parseServerId(req.params.id);
                if (!serverId) {
                    return res.status(400).json({ error: 'Invalid server id' });
                }

                const server = await serverRepository.findById(serverId);
                if (!server) {
                    return res.status(404).json({ error: 'Server not found' });
                }

                assertCanPatchServer(server);
                const body = requireBodyObject(req.body);

                const canSeeEnv = Boolean(req.user?.isRoot)
                    || (await userHasServerPermission(req.user, serverId, PERMISSIONS.server.env));
                const serializeForCaller = (s: GameServerRow) => {
                    const serialized = serializeGameServer(s);
                    return canSeeEnv ? serialized : redactServerEnv(serialized);
                };

                const hasNamePatch = hasOwn(body, 'name');
                const hasPortsPatch = hasOwn(body, 'ports');
                const hasMountsPatch = hasOwn(body, 'mounts');
                const hasEnvPatch = hasOwn(body, 'env') && canSeeEnv;
                const hasHealthcheckPatch = hasOwn(body, 'healthcheck');
                const hasResourceLimitsPatch = hasOwn(body, 'resourceLimits');
                const hasContainerPatch = hasPortsPatch || hasMountsPatch || hasEnvPatch || hasHealthcheckPatch;

                if (!hasNamePatch && !hasContainerPatch && !hasResourceLimitsPatch) {
                    return res.status(400).json({ error: 'No supported server fields provided' });
                }

                let nextName = server.name;
                if (hasNamePatch) {
                    const raw = body.name;
                    if (typeof raw !== 'string') {
                        return res.status(400).json({ error: 'name must be a string' });
                    }

                    nextName = raw.trim();
                    if (!isValidServerName(nextName)) {
                        return res.status(400).json({ error: 'Server name must be between 3 and 50 characters' });
                    }

                    if (nextName !== server.name) {
                        const existing = await serverRepository.findByName(nextName);
                        if (existing && existing.id !== serverId) {
                            return res.status(409).json({ error: 'Server name already exists' });
                        }
                    }
                }

                let normalizedPorts: NormalizedPorts | undefined;
                if (hasPortsPatch) {
                    try {
                        normalizedPorts = buildAndValidateOpenPortMappings({ portsPayload: body.ports as PortsPayload | undefined }).ports;
                        assertHostPortsAbove1024(collectHostPortsByProto(normalizedPorts));
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Invalid ports payload';
                        return res.status(400).json({ error: msg });
                    }

                    try {
                        await assertHostPortsAvailableForServer({
                            ports: normalizedPorts,
                            excludeServerId: serverId,
                            excludeContainerIds: server.docker_container_id ? [server.docker_container_id] : [],
                        });
                    } catch (e) {
                        const statusCode = getErrorStatusCode(e);
                        if (statusCode >= 500) {
                            throw Object.assign(new Error('Port check failed'), { statusCode, cause: e });
                        }

                        const msg = e instanceof Error ? e.message : 'Port check failed';
                        return res.status(statusCode).json({ error: msg });
                    }
                }

                let normalizedMounts: NormalizedMount[] | undefined;
                if (hasMountsPatch) {
                    if (body.mounts === null || body.mounts === undefined) {
                        return res.status(400).json({ error: 'mounts must be an array' });
                    }

                    try {
                        normalizedMounts = normalizeMountsPayload(body.mounts) ?? [];
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Invalid mounts payload';
                        return res.status(400).json({ error: msg });
                    }
                }

                let normalizedEnv: string[] | undefined;
                if (hasEnvPatch) {
                    if (body.env === null || body.env === undefined) {
                        return res.status(400).json({ error: 'env must be an object or array' });
                    }

                    try {
                        normalizedEnv = normalizeEnvPayload(body.env);
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Invalid env payload';
                        return res.status(400).json({ error: msg });
                    }
                }

                let normalizedHealthcheck: NormalizedHealthcheck | null | undefined;
                if (hasHealthcheckPatch) {
                    try {
                        normalizedHealthcheck = normalizeHealthcheckPayload(body.healthcheck as HealthcheckPayload | undefined);
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Invalid healthcheck payload';
                        return res.status(400).json({ error: msg });
                    }
                }

                let normalizedResourceLimits: NormalizedResourceLimits | undefined;
                if (hasResourceLimitsPatch) {
                    try {
                        normalizedResourceLimits = normalizeResourceLimitsPayload(body.resourceLimits);
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Invalid resourceLimits payload';
                        return res.status(400).json({ error: msg });
                    }
                }

                if (hasContainerPatch) {
                    const deleteHostData = parseOptionalBoolean(body.deleteHostData);
                    if (deleteHostData === null) {
                        return res.status(400).json({ error: 'deleteHostData must be a boolean' });
                    }

                    const reconfigure = await reconfigureServerContainer(serverId, {
                        name: nextName,
                        ports: normalizedPorts,
                        mounts: normalizedMounts,
                        env: normalizedEnv,
                        healthcheck: normalizedHealthcheck,
                        hasHealthcheckPatch,
                        resourceLimits: normalizedResourceLimits,
                        hasResourceLimitsPatch,
                        deleteHostData,
                    });

                    await actionsRepository.create(
                        serverId,
                        reconfigure.hostDataDeletionErrors.length ? 'error' : 'success',
                        reconfigure.hostDataDeletionErrors.length
                            ? 'Server reconfigured with mount data deletion errors'
                            : 'Server reconfigured',
                        req.user?.username || ''
                    );

                    const updated = await loadServerAfterMutation(serverId, 'reconfigure');
                    bus.emit('server.updated', { serverId, timestamp: nowIso() });

                    return res.status(200).json({
                        success: true,
                        server: serializeForCaller(updated),
                        reconfigure,
                    });
                }

                if (hasResourceLimitsPatch) {
                    const resourceUpdate = await updateServerResourceLimits(serverId, normalizedResourceLimits ?? null);

                    if (server.name !== nextName) {
                        await serverRepository.update(serverId, { name: nextName });
                    }

                    await actionsRepository.create(
                        serverId,
                        'success',
                        resourceUpdate.dockerUpdated
                            ? 'Server resource limits updated'
                            : 'Server resource limits saved',
                        req.user?.username || ''
                    );

                    const updated = await loadServerAfterMutation(serverId, 'resource-limits-update');
                    bus.emit('server.updated', { serverId, timestamp: nowIso() });

                    return res.status(200).json({
                        success: true,
                        server: serializeForCaller(updated),
                        resourceUpdate,
                    });
                }

                if (server.name === nextName) {
                    return res.status(200).json({ success: true, server: serializeForCaller(server) });
                }

                await serverRepository.update(serverId, { name: nextName });

                const updated = await loadServerAfterMutation(serverId, 'rename');
                bus.emit('server.updated', { serverId, timestamp: nowIso() });

                return res.status(200).json({
                    success: true,
                    server: serializeForCaller(updated),
                });
            } catch (error) {
                return sendRouteError(res, error, {
                    route: 'ROUTE:SERVERS:PATCH',
                    fallbackMessage: 'Failed to patch server',
                    logContext: { serverId: req.params.id },
                });
            }
        }
    );

    return router;
}
