import { execShellCommand } from '../utils/docker.js';
import { getServerOrThrow } from './servers.js';

type BackupCronGetResult =
    | { enabled: false }
    | { enabled: true; schedule: string; line: string };

type BackupCronPatchPayload =
    | { enabled: false }
    | { enabled: true; schedule: string };

function isValidCron5(expr: string): boolean {
    // Very practical validation for classic 5-field cron.
    // Allows: *, digits, ranges, steps, lists, and names (mon,tue) if user wants (optional).
    const s = expr.trim().replace(/\s+/g, ' ');
    const parts = s.split(' ');
    if (parts.length !== 5) return false;

    // Allow common cron tokens + short names (JAN,MON) if present
    const fieldRe = /^[\w*\/,\-]+$/i;
    return parts.every((p) => p.length > 0 && p.length <= 64 && fieldRe.test(p));
}

export async function getBackupCron(serverId: number): Promise<BackupCronGetResult> {
    const server = await getServerOrThrow(serverId);
    const containerId = server.docker_container_id;

    const cmd = `
set -euo pipefail

if ! command -v crontab >/dev/null 2>&1; then
  echo '{"error":"crontab not found in container (cron package missing)"}'
  exit 3
fi

MARK="# gamepanel:backup"

# Identify instance/script name (your LinuxGSM script is /app/<instance>)
INST="$(ls -1 /data/config-lgsm 2>/dev/null | head -n 1 || true)"
if [ -z "$INST" ]; then
  # Fallback: try to detect a LinuxGSM script in /app
  INST="$(ls -1 /app 2>/dev/null | grep -E 'server$|server|mcserver|csgoserver|.*server' | head -n 1 || true)"
fi

# Get current crontab (crontab -l returns exit 1 if empty)
CRON="$(crontab -l 2>/dev/null || true)"

LINE="$(printf "%s\\n" "$CRON" | grep -F "$MARK" | head -n 1 || true)"

if [ -z "$LINE" ]; then
  echo '{"enabled":false}'
  exit 0
fi

# Extract schedule (first 5 fields)
SCHED="$(echo "$LINE" | awk '{print $1" "$2" "$3" "$4" "$5}')"

# JSON escape backslashes and quotes minimally
esc() { echo "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'; }

printf '{"enabled":true,"schedule":"%s","line":"%s"}' "$(esc "$SCHED")" "$(esc "$LINE")"
`.trim();

    const { exitCode, stdout, stderr } = await execShellCommand(containerId, cmd, {
        user: 'linuxgsm',
        workdir: '/app',
    });

    if (exitCode !== 0) {
        // exit 3 -> cron missing (treat as 501-ish)
        const msg = (stderr || stdout || '').trim() || 'Failed to read cron';
        const err = Object.assign(new Error(msg), { statusCode: exitCode === 3 ? 501 : 500 });
        throw err;
    }

    let raw: any;
    try {
        raw = JSON.parse(stdout.trim());
    } catch {
        throw Object.assign(new Error(`Failed to parse cron output: ${stdout}`), { statusCode: 500 });
    }

    if (raw?.error) {
        throw Object.assign(new Error(String(raw.error)), { statusCode: 501 });
    }

    if (raw.enabled === false) return { enabled: false };
    return { enabled: true, schedule: String(raw.schedule ?? ''), line: String(raw.line ?? '') };
}

export async function setBackupCron(
    serverId: number,
    payload: BackupCronPatchPayload
): Promise<void> {
    const server = await getServerOrThrow(serverId);
    const containerId = server.docker_container_id;

    if (payload.enabled === true) {
        if (!payload.schedule || !isValidCron5(payload.schedule)) {
            throw Object.assign(new Error('Invalid cron schedule (expected 5 fields)'), { statusCode: 400 });
        }
    }

    const schedule = payload.enabled ? payload.schedule.trim().replace(/\s+/g, ' ') : '';

    // We build the cron line inside bash to avoid quoting headaches.
    const cmd = `
set -euo pipefail

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab not found in container (cron package missing)" >&2
  exit 3
fi

MARK="# gamepanel:backup"
SCHEDULE="${schedule.replace(/"/g, '\\"')}"

INST="$(ls -1 /data/config-lgsm 2>/dev/null | head -n 1 || true)"
if [ -z "$INST" ]; then
  echo "No instance directory under /data/config-lgsm" >&2
  exit 2
fi

# Keep the user's existing cron lines, but remove any gamepanel backup line(s)
CUR="$(crontab -l 2>/dev/null || true)"
CLEAN="$(printf "%s\\n" "$CUR" | grep -vF "$MARK" || true)"

if [ "$SCHEDULE" = "" ]; then
  # Disable: install cleaned crontab
  printf "%s\\n" "$CLEAN" | crontab -
  exit 0
fi

# Enable/update: add our line
# We point to /app/<instance> backup (LinuxGSM script), silence output by default.
NEWLINE="$SCHEDULE /app/$INST backup > /dev/null 2>&1 $MARK"

# Install new crontab: existing lines + our line at the end (if existing not empty)
if [ -n "$CLEAN" ]; then
  printf "%s\\n%s\\n" "$CLEAN" "$NEWLINE" | crontab -
else
  printf "%s\\n" "$NEWLINE" | crontab -
fi
`.trim();

    const { exitCode, stdout, stderr } = await execShellCommand(containerId, cmd, {
        user: 'linuxgsm',
        workdir: '/app',
    });

    if (exitCode !== 0) {
        const msg = (stderr || stdout || '').trim() || 'Failed to update cron';
        throw Object.assign(new Error(msg), { statusCode: exitCode === 3 ? 501 : 500 });
    }
}
