#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
CS2_INSTALL_DIR="${CS2_INSTALL_DIR:-${DATA_DIR}/server}"
CS2_GAME_ROOT="${CS2_GAME_ROOT:-${CS2_INSTALL_DIR}/game}"
CS2_LAUNCHER="${CS2_LAUNCHER:-${CS2_GAME_ROOT}/cs2.sh}"
CS2_SERVER_BIN="${CS2_SERVER_BIN:-${CS2_INSTALL_DIR}/game/bin/linuxsteamrt64/cs2}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/counter-strike2}"
CS2_START_PARAMS="${CS2_START_PARAMS:-}"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-60}"
LOG_PREFIX="[cs2]"

. /app/common.sh

PID_FILE="$(cs2_pid_file_path)"
FIFO="$(cs2_fifo_path)"
STOP_REQUESTED="false"

mkdir -p "${RUNTIME_DIR}"

cleanup() {
  rm -f "${PID_FILE}"
  rm -f "${FIFO}"
}
trap cleanup EXIT

graceful_stop() {
  if [ "${STOP_REQUESTED}" = "true" ]; then
    return 0
  fi

  STOP_REQUESTED="true"
  log "Shutdown requested, stopping CS2..."

  if is_cs2_server_running; then
    RUNNING_PID="$(read_cs2_pid)"
    kill -TERM "-${RUNNING_PID}" 2>/dev/null || kill -TERM "${RUNNING_PID}" 2>/dev/null || true

    DEADLINE=$(( $(date +%s) + STOP_TIMEOUT_SECONDS ))
    while kill -0 "${RUNNING_PID}" 2>/dev/null; do
      if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
        log "CS2 did not stop in time, killing process..."
        kill -KILL "-${RUNNING_PID}" 2>/dev/null || kill -KILL "${RUNNING_PID}" 2>/dev/null || true
        break
      fi

      sleep 1
    done
  fi
}

trap graceful_stop TERM INT

if [ ! -x "${CS2_SERVER_BIN}" ]; then
  die "CS2 server binary is not executable: ${CS2_SERVER_BIN}"
fi

if [ ! -d "${CS2_GAME_ROOT}" ]; then
  die "CS2 game root directory not found: ${CS2_GAME_ROOT}"
fi

if [ ! -x "${CS2_LAUNCHER}" ]; then
  die "CS2 launcher script is not executable: ${CS2_LAUNCHER}"
fi

if ! command -v setsid >/dev/null 2>&1; then
  die "setsid is required to supervise the CS2 launcher process group."
fi

if [ -e "${FIFO}" ] && [ ! -p "${FIFO}" ]; then
  die "CS2 stdin path exists but is not a FIFO: ${FIFO}"
fi

rm -f "${FIFO}"
mkfifo "${FIFO}"
exec 3<>"${FIFO}"

cd "${CS2_GAME_ROOT}"

set -- "${CS2_LAUNCHER}" -dedicated

set -f
set -- "$@" ${CS2_START_PARAMS}
set +f

setsid stdbuf -oL "$@" <&3 &
CS2_PID=$!

echo "${CS2_PID}" > "${PID_FILE}"
log "Server PID: ${CS2_PID}"
log "Launching CS2 dedicated server..."

EXIT_CODE=0

while :; do
  if wait "${CS2_PID}"; then
    EXIT_CODE=0
    break
  fi

  EXIT_CODE=$?

  if kill -0 "${CS2_PID}" 2>/dev/null; then
    continue
  fi

  break
done

log "CS2 server exited with code ${EXIT_CODE}"
exit "${EXIT_CODE}"
