import { getOvhcloudServerAdapter } from './adapters/registry.js';
import type { OvhcloudConsoleSupport } from './adapters/types.js';
import type { GameServerRow } from '../../types/gameServer.js';
import * as dockerUtils from '../../utils/docker.js';

type ConsoleCommandResult = {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
};

function getConsoleSupport(server: GameServerRow): OvhcloudConsoleSupport {
    const adapter = getOvhcloudServerAdapter(server);
    const support = typeof adapter.console === 'function'
        ? adapter.console(server)
        : adapter.console;

    if (!support) {
        throw Object.assign(new Error('Console commands are not supported for this OVHcloud image'), { statusCode: 501 });
    }

    return support;
}

function normalizeCommand(command: unknown): string {
    if (typeof command !== 'string') {
        throw Object.assign(new Error('command must be a string'), { statusCode: 400 });
    }

    const normalized = command.trim();
    if (!normalized) {
        throw Object.assign(new Error('command is required'), { statusCode: 400 });
    }

    if (normalized.length > 4000 || /[\0\r\n]/.test(normalized)) {
        throw Object.assign(new Error('command is invalid'), { statusCode: 400 });
    }

    return normalized;
}

export async function sendOvhcloudConsoleCommand(
    server: GameServerRow & { docker_container_id: string },
    rawCommand: unknown
): Promise<ConsoleCommandResult> {
    if (server.provider !== 'ovhcloud') {
        throw Object.assign(new Error('Console commands are only available for OVHcloud servers'), { statusCode: 501 });
    }

    const support = getConsoleSupport(server);
    const command = normalizeCommand(rawCommand);
    const status = await dockerUtils.checkContainerStatus(server.docker_container_id);

    if (status !== 'running') {
        throw Object.assign(new Error(`Console commands require a running container; current status is ${status}`), { statusCode: 409 });
    }

    const result = await dockerUtils.execInContainer(
        server.docker_container_id,
        [support.script, command],
        {
            user: support.user,
            workdir: support.workdir,
        }
    );

    return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
    };
}
