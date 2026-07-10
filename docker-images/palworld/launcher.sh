#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
PALWORLD_INSTALL_DIR="${PALWORLD_INSTALL_DIR:-${DATA_DIR}/server}"
PALWORLD_LAUNCHER="${PALWORLD_LAUNCHER:-${PALWORLD_INSTALL_DIR}/PalServer.sh}"
PALWORLD_SERVER_BIN="${PALWORLD_SERVER_BIN:-${PALWORLD_INSTALL_DIR}/Pal/Binaries/Linux/PalServer-Linux-Shipping}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/palworld}"
PALWORLD_START_PARAMS="${PALWORLD_START_PARAMS:-}"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-60}"
LOG_PREFIX="[palworld]"

. /app/common.sh

PID_FILE="$(palworld_pid_file_path)"
STOP_REQUESTED="false"

mkdir -p "${RUNTIME_DIR}"

cleanup() {
  rm -f "${PID_FILE}"
}
trap cleanup EXIT

graceful_stop() {
  if [ "${STOP_REQUESTED}" = "true" ]; then
    return 0
  fi

  STOP_REQUESTED="true"
  log "Shutdown requested, stopping Palworld..."

  if is_palworld_server_running; then
    RUNNING_PID="$(read_palworld_pid)"
    kill -TERM "-${RUNNING_PID}" 2>/dev/null || kill -TERM "${RUNNING_PID}" 2>/dev/null || true

    DEADLINE=$(( $(date +%s) + STOP_TIMEOUT_SECONDS ))
    while kill -0 "${RUNNING_PID}" 2>/dev/null; do
      if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
        log "Palworld did not stop in time, killing process..."
        kill -KILL "-${RUNNING_PID}" 2>/dev/null || kill -KILL "${RUNNING_PID}" 2>/dev/null || true
        break
      fi

      sleep 1
    done
  fi
}

trap graceful_stop TERM INT

if [ ! -x "${PALWORLD_SERVER_BIN}" ]; then
  die "Palworld server binary is not executable: ${PALWORLD_SERVER_BIN}"
fi

if [ ! -d "${PALWORLD_INSTALL_DIR}" ]; then
  die "Palworld install directory not found: ${PALWORLD_INSTALL_DIR}"
fi

if [ ! -x "${PALWORLD_LAUNCHER}" ]; then
  die "Palworld launcher script is not executable: ${PALWORLD_LAUNCHER}"
fi

if ! command -v setsid >/dev/null 2>&1; then
  die "setsid is required to supervise the Palworld launcher process group."
fi

cd "${PALWORLD_INSTALL_DIR}"

set -- "${PALWORLD_LAUNCHER}"

set -f
set -- "$@" ${PALWORLD_START_PARAMS}
set +f

setsid stdbuf -oL "$@" </dev/null &
PALWORLD_PID=$!

echo "${PALWORLD_PID}" > "${PID_FILE}"
log "Server PID: ${PALWORLD_PID}"
log "Launching Palworld dedicated server..."

EXIT_CODE=0

while :; do
  if wait "${PALWORLD_PID}"; then
    EXIT_CODE=0
    break
  fi

  EXIT_CODE=$?

  if kill -0 "${PALWORLD_PID}" 2>/dev/null; then
    continue
  fi

  break
done

log "Palworld server exited with code ${EXIT_CODE}"
exit "${EXIT_CODE}"
