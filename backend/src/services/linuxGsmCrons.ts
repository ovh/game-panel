import { getLinuxGsmMetadata } from '../providers/serverMetadata.js';
import type { GameServerRow } from '../types/gameServer.js';
import * as dockerUtils from '../utils/docker.js';
import { logError } from '../utils/logger.js';

function shQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function removeLinuxGsmContainerCrons(server: GameServerRow): Promise<void> {
    if (server.provider !== 'linuxgsm' || !server.docker_container_id) return;

    const status = await dockerUtils.checkContainerStatus(server.docker_container_id).catch(() => 'unknown');
    if (status !== 'running') return;

    const linuxgsm = getLinuxGsmMetadata(server);
    const updateCommand = `/app/${linuxgsm.gameservername} update`;

    const cmd = `
set +e

if ! command -v crontab >/dev/null 2>&1; then
  exit 0
fi

CRON="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf "%s\\n" "$CRON" \\
  | sed 's/[[:space:]]*$//' \\
  | grep -vF ${shQuote(updateCommand)} \\
  | grep -vF '# gamepanel:backup' \\
  || true
)"

if [ -n "$FILTERED" ]; then
  printf "%s\\n" "$FILTERED" | crontab -
else
  crontab -r >/dev/null 2>&1 || true
fi
`.trim();

    const result = await dockerUtils.execShellCommand(server.docker_container_id, cmd, {
        user: 'linuxgsm',
        workdir: '/app',
    });

    if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || 'Failed to remove LinuxGSM container crons');
    }
}

export async function removeLinuxGsmContainerCronsBestEffort(server: GameServerRow): Promise<void> {
    try {
        await removeLinuxGsmContainerCrons(server);
    } catch (error) {
        logError('SERVICE:LINUXGSM_CRONS:CLEANUP', error, { serverId: server.id });
    }
}
