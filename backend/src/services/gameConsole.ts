import type { GameServerRow } from '../types/gameServer.js';
import { sendLinuxGsmConsoleCommand } from '../providers/linuxgsm/console.js';
import { sendOvhcloudConsoleCommand } from '../providers/ovhcloud/console.js';

export type GameConsoleCommandResult = {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
};

type GameServerWithContainer = GameServerRow & {
    docker_container_id: string;
};

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

export async function sendGameConsoleCommand(
    server: GameServerWithContainer,
    rawCommand: unknown
): Promise<GameConsoleCommandResult> {
    const command = normalizeCommand(rawCommand);

    if (server.provider === 'linuxgsm') {
        return sendLinuxGsmConsoleCommand(server, command);
    }

    if (server.provider === 'ovhcloud') {
        return sendOvhcloudConsoleCommand(server, command);
    }

    throw Object.assign(new Error('Console commands are not supported for this provider'), { statusCode: 501 });
}
