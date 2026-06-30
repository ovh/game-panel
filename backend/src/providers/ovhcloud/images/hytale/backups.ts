import { sendGameConsoleCommand } from '../../../../services/gameConsole.js';
import type { GameServerRow } from '../../../../types/gameServer.js';
import type { OvhcloudBackupCreateResult } from '../../adapters/types.js';
import { assertOvhcloudHytaleServer } from '../hytale.js';

export async function createHytaleBackup(
    server: GameServerRow & { docker_container_id: string }
): Promise<OvhcloudBackupCreateResult> {
    assertOvhcloudHytaleServer(server);

    const result = await sendGameConsoleCommand(server, 'backup');

    return {
        ok: result.ok,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        mode: 'hot',
    };
}
