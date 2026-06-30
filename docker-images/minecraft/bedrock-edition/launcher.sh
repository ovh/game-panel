#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft-bedrock}"
BEDROCK_SERVER_BIN="${BEDROCK_SERVER_BIN:-${DATA_DIR}/bedrock_server}"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-60}"
LOG_PREFIX="[bedrock]"

. /app/common.sh

FIFO="$(bedrock_fifo_path)"
PID_FILE="$(bedrock_pid_file_path)"

STOP_REQUESTED="false"

mkdir -p "${DATA_DIR}" "${RUNTIME_DIR}"

cleanup() {
  rm -f "${PID_FILE}" "${FIFO}"
}
trap cleanup EXIT

if [ ! -x "${BEDROCK_SERVER_BIN}" ]; then
  die "Bedrock server binary is not executable: ${BEDROCK_SERVER_BIN}"
fi

rm -f "${FIFO}"
mkfifo "${FIFO}"

exec 3<>"${FIFO}"

graceful_stop() {
  if [ "${STOP_REQUESTED}" = "true" ]; then
    return 0
  fi

  STOP_REQUESTED="true"
  log "Shutdown requested, sending 'stop' to Bedrock..."

  if is_bedrock_server_running; then
    /app/send-command.sh "stop" || true

    RUNNING_PID="$(read_bedrock_pid)"
    DEADLINE=$(( $(date +%s) + STOP_TIMEOUT_SECONDS ))

    while kill -0 "${RUNNING_PID}" 2>/dev/null; do
      if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
        log "Bedrock did not stop in time, killing process..."
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

cd "${DATA_DIR}"

LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-${DATA_DIR}}"
export LD_LIBRARY_PATH

"${BEDROCK_SERVER_BIN}" <&3 &
BEDROCK_PID=$!

echo "${BEDROCK_PID}" > "${PID_FILE}"
log "Server PID: ${BEDROCK_PID}"
log "Launching server..."

EXIT_CODE=0

while :; do
  if wait "${BEDROCK_PID}"; then
    EXIT_CODE=0
    break
  fi

  EXIT_CODE=$?

  if kill -0 "${BEDROCK_PID}" 2>/dev/null; then
    continue
  fi

  break
done

log "Bedrock server exited with code ${EXIT_CODE}"
exit "${EXIT_CODE}"
