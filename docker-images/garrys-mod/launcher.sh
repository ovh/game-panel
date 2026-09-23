#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
GMOD_INSTALL_DIR="${GMOD_INSTALL_DIR:-${DATA_DIR}/server}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/garrys-mod}"
GMOD_SERVER_PORT="${GMOD_SERVER_PORT:-27015}"
GMOD_START_PARAMS="${GMOD_START_PARAMS:-}"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-60}"
LOG_PREFIX="[gmod]"

. /app/common.sh

GMOD_SERVER_BIN="${GMOD_SERVER_BIN:-$(gmod_server_binary)}"

PID_FILE="$(gmod_pid_file_path)"
FIFO="$(gmod_fifo_path)"
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
  log "Shutdown requested, stopping Garry's Mod..."

  if is_gmod_server_running; then
    RUNNING_PID="$(read_gmod_pid)"

    kill -TERM "-${RUNNING_PID}" 2>/dev/null || kill -TERM "${RUNNING_PID}" 2>/dev/null || true

    DEADLINE=$(( $(date +%s) + STOP_TIMEOUT_SECONDS ))
    while kill -0 "${RUNNING_PID}" 2>/dev/null; do
      if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
        log "Garry's Mod did not stop in time, killing process..."
        kill -KILL "-${RUNNING_PID}" 2>/dev/null || kill -KILL "${RUNNING_PID}" 2>/dev/null || true
        break
      fi

      sleep 1
    done
  fi
}

trap graceful_stop TERM INT

if [ ! -x "${GMOD_SERVER_BIN}" ]; then
  die "Garry's Mod server launcher is not executable: ${GMOD_SERVER_BIN}"
fi

if [ ! -d "$(gmod_game_dir)" ]; then
  die "Garry's Mod game directory not found: $(gmod_game_dir)"
fi

if ! command -v setsid >/dev/null 2>&1; then
  die "setsid is required to supervise the Garry's Mod server process group."
fi

if [ -e "${FIFO}" ] && [ ! -p "${FIFO}" ]; then
  die "Garry's Mod stdin path exists but is not a FIFO: ${FIFO}"
fi

rm -f "${FIFO}"
mkfifo "${FIFO}"
exec 3<>"${FIFO}"

cd "${GMOD_INSTALL_DIR}"

set -- "${GMOD_SERVER_BIN}" \
  -game garrysmod \
  -console \
  -norestart \
  -strictportbind \
  -port "${GMOD_SERVER_PORT}"

set -f
set -- "$@" ${GMOD_START_PARAMS}
set +f

setsid stdbuf -oL "$@" <&3 &
GMOD_PID=$!

echo "${GMOD_PID}" > "${PID_FILE}"
log "Server PID: ${GMOD_PID}"
log "Launching Garry's Mod dedicated server (port: ${GMOD_SERVER_PORT}/udp)..."

EXIT_CODE=0

while :; do
  if wait "${GMOD_PID}"; then
    EXIT_CODE=0
    break
  fi

  EXIT_CODE=$?

  if kill -0 "${GMOD_PID}" 2>/dev/null; then
    continue
  fi

  break
done

log "Garry's Mod server exited with code ${EXIT_CODE}"
exit "${EXIT_CODE}"
