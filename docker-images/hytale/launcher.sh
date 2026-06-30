#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
HYTALE_GAME_DIR="${HYTALE_GAME_DIR:-${DATA_DIR}/game}"
HYTALE_START_SCRIPT="${HYTALE_START_SCRIPT:-${HYTALE_GAME_DIR}/start.sh}"
HYTALE_START_PARAMS="${HYTALE_START_PARAMS:-}"
HYTALE_REQUIRED_START_PARAMS="${HYTALE_REQUIRED_START_PARAMS:---accept-early-plugins}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/hytale}"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-60}"
LOG_PREFIX="[hytale]"

. /app/common.sh

PID_FILE="$(hytale_pid_file_path)"
FIFO="$(hytale_fifo_path)"
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
  log "Shutdown requested, sending 'stop' to Hytale..."

  if is_hytale_server_running; then
    /app/send-command.sh "stop" || true

    RUNNING_PID="$(read_hytale_pid)"
    DEADLINE=$(( $(date +%s) + STOP_TIMEOUT_SECONDS ))

    while kill -0 "${RUNNING_PID}" 2>/dev/null; do
      if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
        log "Hytale did not stop in time, terminating launcher process..."
        kill -TERM "${RUNNING_PID}" 2>/dev/null || true
        sleep 2
        kill -KILL "${RUNNING_PID}" 2>/dev/null || true
        break
      fi

      sleep 1
    done
  fi
}

trap graceful_stop TERM INT

if [ ! -x "${HYTALE_START_SCRIPT}" ]; then
  die "Hytale start script is not executable: ${HYTALE_START_SCRIPT}"
fi

if [ -e "${FIFO}" ] && [ ! -p "${FIFO}" ]; then
  die "Hytale stdin path exists but is not a FIFO: ${FIFO}"
fi

rm -f "${FIFO}"
mkfifo "${FIFO}"
exec 3<>"${FIFO}"

cd "${HYTALE_GAME_DIR}"

set -- "${HYTALE_START_SCRIPT}"

set -f
if [ -n "${HYTALE_REQUIRED_START_PARAMS}" ]; then
  set -- "$@" ${HYTALE_REQUIRED_START_PARAMS}
fi
if [ -n "${HYTALE_START_PARAMS}" ]; then
  set -- "$@" ${HYTALE_START_PARAMS}
fi
set +f

"$@" <&3 &
HYTALE_PID=$!

echo "${HYTALE_PID}" > "${PID_FILE}"
log "Server PID: ${HYTALE_PID}"
log "Launching Hytale dedicated server..."

EXIT_CODE=0

while :; do
  if wait "${HYTALE_PID}"; then
    EXIT_CODE=0
    break
  fi

  EXIT_CODE=$?

  if kill -0 "${HYTALE_PID}" 2>/dev/null; then
    continue
  fi

  break
done

log "Hytale server exited with code ${EXIT_CODE}"
exit "${EXIT_CODE}"
