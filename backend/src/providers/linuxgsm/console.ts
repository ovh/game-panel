import type { GameServerRow } from '../../types/gameServer.js';
import * as dockerUtils from '../../utils/docker.js';
import { getLinuxGsmMetadata } from '../serverMetadata.js';

type LinuxGsmConsoleCommandResult = {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
};

const LINUXGSM_SEND_TIMEOUT_SECONDS = 30;
const LINUXGSM_SEND_KILL_AFTER_SECONDS = 5;

export function sanitizeLinuxGsmScriptName(raw?: string): string {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    return value.replace(/[^a-zA-Z0-9_.-]/g, '');
}

function getLinuxGsmScriptPath(server: GameServerRow): string {
    const linuxgsm = getLinuxGsmMetadata(server);
    const script = sanitizeLinuxGsmScriptName(linuxgsm.gameservername);
    if (!script) {
        throw Object.assign(new Error('Invalid LinuxGSM game server script name'), { statusCode: 500 });
    }
    return `/app/${script}`;
}

export async function sendLinuxGsmConsoleCommand(
    server: GameServerRow & { docker_container_id: string },
    command: string
): Promise<LinuxGsmConsoleCommandResult> {
    if (server.provider !== 'linuxgsm') {
        throw Object.assign(new Error('Console commands are only available for LinuxGSM servers'), { statusCode: 501 });
    }

    const status = await dockerUtils.checkContainerStatus(server.docker_container_id);
    if (status !== 'running') {
        throw Object.assign(new Error(`Console commands require a running container; current status is ${status}`), { statusCode: 409 });
    }

    const scriptPath = getLinuxGsmScriptPath(server);
    const result = await dockerUtils.execInContainer(
        server.docker_container_id,
        [
            'timeout',
            '-k',
            `${LINUXGSM_SEND_KILL_AFTER_SECONDS}s`,
            `${LINUXGSM_SEND_TIMEOUT_SECONDS}s`,
            scriptPath,
            'send',
            command,
        ],
        {
            user: 'linuxgsm',
            workdir: '/app',
        }
    );

    return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
    };
}
