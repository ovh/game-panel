import { execShellCommand } from '../utils/docker.js';
import { getServerOrThrow } from '../services/servers.js';

type BackupSettings = {
    maxbackups: number;
    maxbackupdays: number;
    stoponbackup: boolean;
};

export async function getBackupSettings(
    serverId: number,
): Promise<BackupSettings> {
    const server = await getServerOrThrow(serverId);
    const containerId = server.docker_container_id;

    const cmd = `
set -euo pipefail

INST="$(ls -1 /data/config-lgsm 2>/dev/null | head -n 1 || true)"
if [ -z "$INST" ]; then
  echo '{"error":"No instance directory under /data/config-lgsm"}'
  exit 2
fi

COMMON="/data/config-lgsm/$INST/common.cfg"
DEF="/data/config-lgsm/$INST/_default.cfg"

getv() {
  # $1 = key, $2 = file
  grep -E "^[[:space:]]*$1=" "$2" 2>/dev/null | tail -n 1 | sed -E "s/^[[:space:]]*$1=//"
}

strip_quotes() {
  # remove all double quotes and trim spaces
  echo "$1" | sed 's/"//g' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

c_maxbackups="$(getv maxbackups "$COMMON" || true)"
c_maxbackupdays="$(getv maxbackupdays "$COMMON" || true)"
c_stoponbackup="$(getv stoponbackup "$COMMON" || true)"

d_maxbackups="$(getv maxbackups "$DEF" || true)"
d_maxbackupdays="$(getv maxbackupdays "$DEF" || true)"
d_stoponbackup="$(getv stoponbackup "$DEF" || true)"

maxbackups="$c_maxbackups"; [ -z "$maxbackups" ] && maxbackups="$d_maxbackups"
maxbackupdays="$c_maxbackupdays"; [ -z "$maxbackupdays" ] && maxbackupdays="$d_maxbackupdays"
stoponbackup="$c_stoponbackup"; [ -z "$stoponbackup" ] && stoponbackup="$d_stoponbackup"

maxbackups="$(strip_quotes "$maxbackups")"
maxbackupdays="$(strip_quotes "$maxbackupdays")"
stoponbackup="$(strip_quotes "$stoponbackup")"

printf '{"maxbackups":"%s","maxbackupdays":"%s","stoponbackup":"%s"}' \
  "$maxbackups" "$maxbackupdays" "$stoponbackup"
`.trim();

    const { exitCode, stdout, stderr } = await execShellCommand(containerId, cmd, {
        user: 'linuxgsm',
        workdir: '/app',
    });

    if (exitCode !== 0) {
        throw new Error(`Failed to read backup settings: ${stderr || stdout}`);
    }

    let raw: any;
    try {
        raw = JSON.parse(stdout.trim());
    } catch {
        throw new Error(`Failed to parse backup settings output: ${stdout}`);
    }

    if (raw?.error) throw new Error(String(raw.error));

    const parseIntFromCfg = (v: unknown): number => {
        const n = Number.parseInt(String(v ?? '').trim(), 10);
        return Number.isFinite(n) ? n : 0;
    };

    const parseStopOnBackup = (v: unknown): boolean => {
        const s = String(v ?? '').trim().toLowerCase();
        return ['on', 'true', '1', 'yes'].includes(s);
    };

    return {
        maxbackups: parseIntFromCfg(raw.maxbackups),
        maxbackupdays: parseIntFromCfg(raw.maxbackupdays),
        stoponbackup: parseStopOnBackup(raw.stoponbackup),
    };
}

export async function setBackupSettings(
    serverId: number,
    patch: Partial<BackupSettings>
): Promise<void> {
    const server = await getServerOrThrow(serverId);
    const containerId = server.docker_container_id;

    // Validation
    if (patch.maxbackups != null && (!Number.isInteger(patch.maxbackups) || patch.maxbackups < 0)) {
        throw Object.assign(new Error('maxbackups must be a non-negative integer'), { statusCode: 400 });
    }
    if (patch.maxbackupdays != null && (!Number.isInteger(patch.maxbackupdays) || patch.maxbackupdays < 0)) {
        throw Object.assign(new Error('maxbackupdays must be a non-negative integer'), { statusCode: 400 });
    }
    if (patch.stoponbackup != null && typeof patch.stoponbackup !== 'boolean') {
        throw Object.assign(new Error('stoponbackup must be a boolean'), { statusCode: 400 });
    }

    const hasAny =
        patch.maxbackups != null || patch.maxbackupdays != null || patch.stoponbackup != null;

    if (!hasAny) return;

    // Route handlers must normalize types before calling this service.
    // For example, convert string numerics (e.g. "2") to numbers in the route layer.

    const assignments: string[] = [];
    if (patch.maxbackups != null) assignments.push(`apply maxbackups "${patch.maxbackups}"`);
    if (patch.maxbackupdays != null) assignments.push(`apply maxbackupdays "${patch.maxbackupdays}"`);
    if (patch.stoponbackup != null) assignments.push(`apply stoponbackup "${patch.stoponbackup ? 'on' : 'off'}"`);

    const cmd = `
set -euo pipefail
INST="$(ls -1 /data/config-lgsm 2>/dev/null | head -n 1 || true)"
if [ -z "$INST" ]; then
  echo "No instance directory under /data/config-lgsm" >&2
  exit 2
fi

CFG="/data/config-lgsm/$INST/common.cfg"
touch "$CFG"

apply() {
  k="$1"
  v="$2"

  # If key exists, replace line; else append.
  if grep -qE "^[[:space:]]*$k=" "$CFG"; then
    sed -i "s|^[[:space:]]*$k=.*|$k=\\"$v\\"|" "$CFG"
  else
    printf "\\n%s=\\"%s\\"\\n" "$k" "$v" >> "$CFG"
  fi
}

${assignments.join('\n')}

grep -nE "^[[:space:]]*(maxbackups|maxbackupdays|stoponbackup)=" "$CFG" || true
`.trim();

    const { exitCode, stdout, stderr } = await execShellCommand(containerId, cmd, {
        user: 'linuxgsm',
        workdir: '/app',
    });

    if (exitCode !== 0) {
        throw new Error(`Failed to update backup settings: ${stderr || stdout}`);
    }
}
