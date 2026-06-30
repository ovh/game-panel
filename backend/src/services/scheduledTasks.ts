import { scheduledTaskRepository, serverRepository, actionsRepository } from '../database/index.js';
import type { ScheduledTaskRow } from '../types/database.js';
import type { GameServerRow } from '../types/gameServer.js';
import { getRuntimeConfig } from '../providers/serverMetadata.js';
import { assertValidCronExpression, nextCronRunAt } from '../utils/cron.js';
import { parseJsonObject } from '../utils/json.js';
import { logError } from '../utils/logger.js';
import { nowIso, toIsoTimestamp, toIsoTimestampOrNull } from '../utils/time.js';
import * as dockerUtils from '../utils/docker.js';
import { createServerBackup } from './serverBackups.js';
import { sendGameConsoleCommand } from './gameConsole.js';
import {
    beginServerTransition,
    clearServerTransition,
    completeServerTransition,
    POWER_TRANSITION_TIMEOUT_MS,
    RESTART_HEALTH_POLL_DELAY_MS,
    reconcileServerStatus,
} from './serverTransitions.js';
import {
    getServerStopTimeoutSeconds,
    restartOvhcloudServerIfHandled,
} from './ovhcloudLifecycle.js';
import { removeLinuxGsmContainerCronsBestEffort } from './linuxGsmCrons.js';

type ScheduledTaskType = ScheduledTaskRow['type'];
type ScheduledTaskLastStatus = 'success' | 'failed' | 'skipped';

export type ScheduledTaskStep =
    | { type: 'game_command'; command: string }
    | { type: 'sleep'; seconds: number };

export type ScheduledTaskPayload = {
    pre?: ScheduledTaskStep[];
    post?: ScheduledTaskStep[];
    command?: string;
    workdir?: string;
    includeServerArtifact?: boolean;
};

export type SerializedScheduledTask = {
    id: number;
    serverId: number;
    type: ScheduledTaskType;
    schedule: string;
    enabled: boolean;
    payload: ScheduledTaskPayload;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    lockedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

const SCHEDULER_INTERVAL_MS = 30_000;
const MAX_STEP_COUNT = 20;
const MAX_COMMAND_LENGTH = 4000;
const MAX_WORKDIR_LENGTH = 512;
const MAX_SLEEP_SECONDS = 3600;
const TASK_ACTOR = 'scheduler';
const runningTasks = new Set<number>();
let runnerStarted = false;
let runnerTickRunning = false;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    throw Object.assign(new Error(`${fieldName} must be a boolean`), { statusCode: 400 });
}

function normalizeCommand(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
        throw Object.assign(new Error(`${fieldName} must be a string`), { statusCode: 400 });
    }

    const command = value.trim();
    if (!command) {
        throw Object.assign(new Error(`${fieldName} is required`), { statusCode: 400 });
    }

    if (command.length > MAX_COMMAND_LENGTH || /[\0\r\n]/.test(command)) {
        throw Object.assign(new Error(`${fieldName} is invalid`), { statusCode: 400 });
    }

    return command;
}

function normalizeWorkdir(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') {
        throw Object.assign(new Error('payload.workdir must be a string'), { statusCode: 400 });
    }

    const workdir = value.trim();
    if (!workdir.startsWith('/') || workdir.length > MAX_WORKDIR_LENGTH || /[\0\r\n]/.test(workdir)) {
        throw Object.assign(new Error('payload.workdir must be an absolute container path'), { statusCode: 400 });
    }

    return workdir;
}

function normalizeSteps(value: unknown, fieldName: 'pre' | 'post'): ScheduledTaskStep[] | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) {
        throw Object.assign(new Error(`payload.${fieldName} must be an array`), { statusCode: 400 });
    }
    if (value.length > MAX_STEP_COUNT) {
        throw Object.assign(new Error(`payload.${fieldName} cannot contain more than ${MAX_STEP_COUNT} steps`), { statusCode: 400 });
    }

    return value.map((raw, index): ScheduledTaskStep => {
        if (!isPlainObject(raw)) {
            throw Object.assign(new Error(`payload.${fieldName}[${index}] must be an object`), { statusCode: 400 });
        }

        if (raw.type === 'game_command') {
            return {
                type: 'game_command',
                command: normalizeCommand(raw.command, `payload.${fieldName}[${index}].command`),
            };
        }

        if (raw.type === 'sleep') {
            const seconds = Number(raw.seconds);
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_SLEEP_SECONDS) {
                throw Object.assign(new Error(`payload.${fieldName}[${index}].seconds must be between 0 and ${MAX_SLEEP_SECONDS}`), { statusCode: 400 });
            }
            return { type: 'sleep', seconds };
        }

        throw Object.assign(new Error(`payload.${fieldName}[${index}].type is invalid`), { statusCode: 400 });
    });
}

function normalizeTaskType(value: unknown): ScheduledTaskType {
    if (value === 'restart' || value === 'backup' || value === 'custom') return value;
    throw Object.assign(new Error('type must be restart, backup, or custom'), { statusCode: 400 });
}

function normalizePayload(type: ScheduledTaskType, value: unknown): ScheduledTaskPayload {
    if (value !== undefined && value !== null && !isPlainObject(value)) {
        throw Object.assign(new Error('payload must be an object'), { statusCode: 400 });
    }

    const raw = isPlainObject(value) ? value : {};
    const payload: ScheduledTaskPayload = {};
    const pre = normalizeSteps(raw.pre, 'pre');
    const post = normalizeSteps(raw.post, 'post');

    if (pre) payload.pre = pre;
    if (post) payload.post = post;

    if (type === 'custom') {
        payload.command = normalizeCommand(raw.command, 'payload.command');
        payload.workdir = normalizeWorkdir(raw.workdir);
    }

    if (type === 'backup' && raw.includeServerArtifact !== undefined) {
        payload.includeServerArtifact = normalizeOptionalBoolean(raw.includeServerArtifact, 'payload.includeServerArtifact');
    }

    return payload;
}

function parsePayload(row: ScheduledTaskRow): ScheduledTaskPayload {
    return parseJsonObject<ScheduledTaskPayload>(row.payload_json, {});
}

function computeNextRunAt(schedule: string, enabled: boolean): string | null {
    return enabled ? nextCronRunAt(schedule).toISOString() : null;
}

function errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return message.length > 1000 ? `${message.slice(0, 997)}...` : message;
}

function getServerWithContainer(server: GameServerRow | null): (GameServerRow & { docker_container_id: string }) | null {
    if (!server?.docker_container_id) return null;
    return server as GameServerRow & { docker_container_id: string };
}

function getExecContext(server: GameServerRow): { user: string; workdir: string | undefined } {
    const runtime = getRuntimeConfig(server);
    const user = typeof runtime.execUser === 'string' && runtime.execUser.trim()
        ? runtime.execUser.trim()
        : typeof runtime.terminalUser === 'string' && runtime.terminalUser.trim()
            ? runtime.terminalUser.trim()
            : '';

    if (!user) {
        throw Object.assign(new Error('Scheduled custom task requires a runtime exec user'), { statusCode: 409 });
    }

    const workdir = typeof runtime.execWorkdir === 'string' && runtime.execWorkdir.trim()
        ? runtime.execWorkdir.trim()
        : typeof runtime.terminalWorkdir === 'string' && runtime.terminalWorkdir.trim()
            ? runtime.terminalWorkdir.trim()
            : undefined;

    return { user, workdir };
}

export function serializeScheduledTask(row: ScheduledTaskRow): SerializedScheduledTask {
    return {
        id: row.id,
        serverId: row.server_id,
        type: row.type,
        schedule: row.schedule,
        enabled: Boolean(row.enabled),
        payload: parsePayload(row),
        nextRunAt: toIsoTimestampOrNull(row.next_run_at),
        lastRunAt: toIsoTimestampOrNull(row.last_run_at),
        lastStatus: row.last_status,
        lastError: row.last_error,
        lockedAt: toIsoTimestampOrNull(row.locked_at),
        createdAt: toIsoTimestamp(row.created_at),
        updatedAt: toIsoTimestamp(row.updated_at),
    };
}

export async function listScheduledTasks(serverId: number): Promise<SerializedScheduledTask[]> {
    const server = await serverRepository.findById(serverId);
    if (!server) throw Object.assign(new Error('Server not found'), { statusCode: 404 });

    const rows = await scheduledTaskRepository.listForServer(serverId);
    return rows.map(serializeScheduledTask);
}

export async function getScheduledTask(serverId: number, taskId: number): Promise<SerializedScheduledTask> {
    const row = await scheduledTaskRepository.findByIdForServer(taskId, serverId);
    if (!row) throw Object.assign(new Error('Scheduled task not found'), { statusCode: 404 });
    return serializeScheduledTask(row);
}

export async function createScheduledTask(serverId: number, input: {
    type: unknown;
    schedule: unknown;
    enabled?: unknown;
    payload?: unknown;
}): Promise<SerializedScheduledTask> {
    const server = await serverRepository.findById(serverId);
    if (!server) throw Object.assign(new Error('Server not found'), { statusCode: 404 });

    const type = normalizeTaskType(input.type);
    if (typeof input.schedule !== 'string') {
        throw Object.assign(new Error('schedule must be a cron string'), { statusCode: 400 });
    }

    const schedule = assertValidCronExpression(input.schedule);
    const enabled = normalizeOptionalBoolean(input.enabled, 'enabled') ?? true;
    const payload = normalizePayload(type, input.payload);
    const nextRunAt = computeNextRunAt(schedule, enabled);

    const row = await scheduledTaskRepository.create({
        serverId,
        type,
        schedule,
        enabled,
        payload,
        nextRunAt,
    });

    return serializeScheduledTask(row);
}

export async function updateScheduledTask(serverId: number, taskId: number, input: {
    type?: unknown;
    schedule?: unknown;
    enabled?: unknown;
    payload?: unknown;
}): Promise<SerializedScheduledTask> {
    const current = await scheduledTaskRepository.findByIdForServer(taskId, serverId);
    if (!current) throw Object.assign(new Error('Scheduled task not found'), { statusCode: 404 });

    const type = input.type === undefined ? current.type : normalizeTaskType(input.type);
    const schedule = input.schedule === undefined
        ? current.schedule
        : typeof input.schedule === 'string'
            ? assertValidCronExpression(input.schedule)
            : (() => { throw Object.assign(new Error('schedule must be a cron string'), { statusCode: 400 }); })();
    const enabled = normalizeOptionalBoolean(input.enabled, 'enabled') ?? Boolean(current.enabled);
    const payload = normalizePayload(type, input.payload === undefined ? parsePayload(current) : input.payload);
    const nextRunAt = computeNextRunAt(schedule, enabled);

    const updated = await scheduledTaskRepository.update(taskId, {
        type,
        schedule,
        enabled,
        payload,
        nextRunAt,
        lockedAt: null,
    });

    if (!updated) throw Object.assign(new Error('Scheduled task not found'), { statusCode: 404 });
    return serializeScheduledTask(updated);
}

export async function deleteScheduledTask(serverId: number, taskId: number): Promise<void> {
    const row = await scheduledTaskRepository.findByIdForServer(taskId, serverId);
    if (!row) throw Object.assign(new Error('Scheduled task not found'), { statusCode: 404 });
    await scheduledTaskRepository.delete(taskId);
}

async function executeGameCommand(server: GameServerRow & { docker_container_id: string }, command: string): Promise<void> {
    const result = await sendGameConsoleCommand(server, command);
    if (!result.ok) {
        throw new Error(result.stderr || result.stdout || `Game console command failed with exit code ${result.exitCode}`);
    }
}

async function executeStep(server: GameServerRow & { docker_container_id: string }, step: ScheduledTaskStep): Promise<void> {
    if (step.type === 'sleep') {
        await new Promise<void>((resolve) => setTimeout(resolve, step.seconds * 1000));
        return;
    }

    await executeGameCommand(server, step.command);
}

async function executeSteps(server: GameServerRow & { docker_container_id: string }, steps: ScheduledTaskStep[] | undefined): Promise<void> {
    for (const step of steps ?? []) {
        await executeStep(server, step);
    }
}

async function completeDockerPowerTransition(serverId: number): Promise<void> {
    const server = await serverRepository.findById(serverId);
    const withContainer = getServerWithContainer(server);
    if (!withContainer) {
        await reconcileServerStatus(serverId);
        return;
    }

    const runtime = await dockerUtils.inspectContainerRuntime(withContainer.docker_container_id);

    if (runtime.containerStatus !== 'running') {
        await reconcileServerStatus(serverId);
        return;
    }

    await serverRepository.updateRuntimeState(serverId, {
        containerStatus: runtime.containerStatus,
        healthStatus: runtime.healthStatus,
    });

    if (runtime.healthStatus === 'none' || runtime.healthStatus === 'healthy') {
        await completeServerTransition(serverId, 'running');
        return;
    }

    if (runtime.healthStatus === 'unhealthy' || runtime.healthStatus === 'unknown') {
        await completeServerTransition(serverId, 'unhealthy');
    }
}

async function executeRestartTask(server: GameServerRow & { docker_container_id: string }): Promise<void> {
    try {
        await serverRepository.updateDesiredState(server.id, 'running');
        await beginServerTransition(server.id, 'restarting', {
            timeoutMs: POWER_TRANSITION_TIMEOUT_MS,
            timeoutBehavior: 'reconcile',
            pollDockerHealth: true,
            healthPollDelayMs: RESTART_HEALTH_POLL_DELAY_MS,
        });

        const handled = await restartOvhcloudServerIfHandled(server.id, server);
        if (!handled) {
            await dockerUtils.restartContainer(
                server.docker_container_id,
                getServerStopTimeoutSeconds(server)
            );
        }

        const fresh = await serverRepository.findById(server.id);
        if (fresh) await removeLinuxGsmContainerCronsBestEffort(fresh);
        await completeDockerPowerTransition(server.id);
    } catch (error) {
        clearServerTransition(server.id);
        await reconcileServerStatus(server.id).catch((reconcileError) => {
            logError('SERVICE:SCHEDULED_TASKS:RESTART_RECONCILE', reconcileError, { serverId: server.id });
        });
        throw error;
    }
}

async function executeBackupTask(server: GameServerRow & { docker_container_id: string }, payload: ScheduledTaskPayload): Promise<void> {
    const result = await createServerBackup(server, {
        includeServerArtifact: Boolean(payload.includeServerArtifact),
    });

    if (!result.ok) {
        throw new Error(result.stderr || result.stdout || `Backup failed with exit code ${result.exitCode}`);
    }
}

async function executeCustomTask(server: GameServerRow & { docker_container_id: string }, payload: ScheduledTaskPayload): Promise<void> {
    const command = payload.command;
    if (!command) throw new Error('Scheduled custom task has no command');

    const runtime = getExecContext(server);
    const result = await dockerUtils.execInContainer(
        server.docker_container_id,
        ['sh', '-lc', command],
        {
            user: runtime.user,
            workdir: payload.workdir ?? runtime.workdir,
        }
    );

    if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || `Custom scheduled task failed with exit code ${result.exitCode}`);
    }
}

async function executeScheduledTaskCore(server: GameServerRow & { docker_container_id: string }, row: ScheduledTaskRow): Promise<void> {
    const payload = parsePayload(row);

    await executeSteps(server, payload.pre);

    if (row.type === 'restart') {
        await executeRestartTask(server);
    } else if (row.type === 'backup') {
        await executeBackupTask(server, payload);
    } else {
        await executeCustomTask(server, payload);
    }

    const freshServer = await serverRepository.findById(server.id);
    const postServer = getServerWithContainer(freshServer) ?? server;
    await executeSteps(postServer, payload.post);
}

async function finishTask(row: ScheduledTaskRow, status: ScheduledTaskLastStatus, error?: unknown): Promise<void> {
    const fresh = await scheduledTaskRepository.findById(row.id);
    if (!fresh) return;

    const nextRunAt = Boolean(fresh.enabled)
        ? computeNextRunAt(fresh.schedule, true)
        : null;

    await scheduledTaskRepository.finish(row.id, {
        nextRunAt,
        lastStatus: status,
        lastError: error ? errorMessage(error) : null,
    });
}

async function executeScheduledTask(row: ScheduledTaskRow): Promise<void> {
    if (runningTasks.has(row.id)) return;
    runningTasks.add(row.id);

    try {
        const locked = await scheduledTaskRepository.lock(row.id, nowIso());
        if (!locked) return;

        const fresh = await scheduledTaskRepository.findById(row.id);
        if (!fresh || !fresh.enabled) {
            await scheduledTaskRepository.unlock(row.id);
            return;
        }

        const server = getServerWithContainer(await serverRepository.findById(fresh.server_id));
        if (!server) {
            await finishTask(fresh, 'skipped', new Error('Server has no container'));
            return;
        }

        const status = await dockerUtils.checkContainerStatus(server.docker_container_id).catch(() => 'missing');
        if (status !== 'running') {
            await actionsRepository.create(
                server.id,
                'info',
                `Scheduled ${fresh.type} skipped because container is ${status}`,
                TASK_ACTOR
            );
            await finishTask(fresh, 'skipped');
            return;
        }

        await actionsRepository.create(server.id, 'info', `Scheduled ${fresh.type} started`, TASK_ACTOR);
        await executeScheduledTaskCore(server, fresh);
        await actionsRepository.create(server.id, 'success', `Scheduled ${fresh.type} completed`, TASK_ACTOR);
        await finishTask(fresh, 'success');
    } catch (error) {
        logError('SERVICE:SCHEDULED_TASKS:EXECUTE', error, { taskId: row.id, serverId: row.server_id, type: row.type });
        await actionsRepository.create(
            row.server_id,
            'error',
            `Scheduled ${row.type} failed: ${errorMessage(error)}`,
            TASK_ACTOR
        ).catch(() => undefined);
        await finishTask(row, 'failed', error).catch(() => undefined);
    } finally {
        runningTasks.delete(row.id);
    }
}

export async function runDueScheduledTasks(): Promise<void> {
    if (runnerTickRunning) return;
    runnerTickRunning = true;

    try {
        const due = await scheduledTaskRepository.listDue(nowIso(), 20);
        await Promise.all(due.map((row) => executeScheduledTask(row)));
    } finally {
        runnerTickRunning = false;
    }
}

export function startScheduledTaskRunner(): { stop: () => void } {
    if (runnerStarted) return { stop: () => undefined };
    runnerStarted = true;

    void scheduledTaskRepository.unlockAllLocked()
        .then(() => runDueScheduledTasks())
        .catch((error) => logError('SERVICE:SCHEDULED_TASKS:STARTUP', error));

    const timer = setInterval(() => {
        void runDueScheduledTasks().catch((error) => {
            logError('SERVICE:SCHEDULED_TASKS:TICK', error);
        });
    }, SCHEDULER_INTERVAL_MS);

    return {
        stop() {
            clearInterval(timer);
            runnerStarted = false;
        },
    };
}
