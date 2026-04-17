import { execShellCommand } from '../utils/docker.js';
import { getServerOrThrow } from '../services/servers.js';

export type AutoUpdateCronState = {
    enabled: boolean;
    schedule: string;
    line: string | null;
};

const DEFAULT_SCHEDULE = '*/60 * * * *';

function buildUpdateCronLine(lgsmServer: string): string {
    return `${DEFAULT_SCHEDULE} /app/${lgsmServer} update > /dev/null 2>&1`;
}

export async function getGameUpdateCron(serverId: number): Promise<AutoUpdateCronState> {
    const server = await getServerOrThrow(serverId);
    const containerId = server.docker_container_id;
    const lgsmServer = server.game_server_name;

    const wantedLine = buildUpdateCronLine(lgsmServer);

    const cmd = `
set -euo pipefail

CRON="$(crontab -l 2>/dev/null || true)"

if printf "%s\\n" "$CRON" | sed 's/[[:space:]]*$//' | grep -Fxq "${wantedLine}"; then
  echo '{"enabled":true}'
else
  echo '{"enabled":false}'
fi
`.trim();

    const { exitCode, stdout, stderr } = await execShellCommand(containerId, cmd, {
        user: 'linuxgsm',
        workdir: '/app',
    });

    if (exitCode !== 0) {
        throw new Error(`Failed to read auto-update cron: ${stderr || stdout}`);
    }

    let raw: any;
    try {
        raw = JSON.parse(stdout.trim());
    } catch {
        throw new Error(`Failed to parse auto-update cron output: ${stdout}`);
    }

    const enabled = Boolean(raw?.enabled);

    return {
        enabled,
        schedule: enabled ? DEFAULT_SCHEDULE : DEFAULT_SCHEDULE,
        line: enabled ? wantedLine : null,
    };
}

export async function setGameUpdateCron(serverId: number, opts: { enabled: boolean }): Promise<void> {
    const server = await getServerOrThrow(serverId);
    const containerId = server.docker_container_id;
    const lgsmServer = server.game_server_name;

    const wantedLine = buildUpdateCronLine(lgsmServer);

    const matchCmd = `/app/${lgsmServer} update`;

    const cmd = `
set -euo pipefail

CRON="$(crontab -l 2>/dev/null || true)"

FILTERED="$(printf "%s\\n" "$CRON" \
  | sed 's/[[:space:]]*$//' \
  | grep -vF "${matchCmd}" \
  || true
)"

if ${opts.enabled ? 'true' : 'false'}; then
  FILTERED="$(printf "%s\\n" "$FILTERED" | grep -Fxv "${wantedLine}" || true)"

  if [ -n "$FILTERED" ]; then
    printf "%s\\n%s\\n" "$FILTERED" "${wantedLine}" | crontab -
  else
    printf "%s\\n" "${wantedLine}" | crontab -
  fi
else
  printf "%s\\n" "$FILTERED" | crontab -
fi
`.trim();

    const { exitCode, stdout, stderr } = await execShellCommand(containerId, cmd, {
        user: 'linuxgsm',
        workdir: '/app',
    });

    if (exitCode !== 0) {
        throw new Error(`Failed to update auto-update cron: ${stderr || stdout}`);
    }
}
