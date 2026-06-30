#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
SERVER_JAR="${SERVER_JAR:-${DATA_DIR}/server.jar}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft}"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-60}"
LOG_PREFIX="[mc]"

. /app/common.sh

FIFO="$(minecraft_fifo_path)"
PID_FILE="$(minecraft_pid_file_path)"

JAVA_BIN="${JAVA_BIN:-java}"
JAVA_OPTS="${JAVA_OPTS:-}"
JVM_OPTS="${JVM_OPTS:-}"
JAVA_XMS="${JAVA_XMS:-}"
JAVA_XMX="${JAVA_XMX:-}"

STOP_REQUESTED="false"

mkdir -p "${DATA_DIR}" "${RUNTIME_DIR}"

cleanup() {
  rm -f "${PID_FILE}" "${FIFO}"
}
trap cleanup EXIT

rm -f "${FIFO}"
mkfifo "${FIFO}"

exec 3<>"${FIFO}"

graceful_stop() {
  if [ "${STOP_REQUESTED}" = "true" ]; then
    return 0
  fi

  STOP_REQUESTED="true"
  log "Shutdown requested, sending 'stop' to Minecraft..."

  if is_minecraft_server_running; then
    /app/send-command.sh "stop" || true

    RUNNING_PID="$(read_minecraft_pid)"
    DEADLINE=$(( $(date +%s) + STOP_TIMEOUT_SECONDS ))

    while kill -0 "${RUNNING_PID}" 2>/dev/null; do
      if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
        log "Minecraft did not stop in time, killing process..."
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

set -- "${JAVA_BIN}"

set -f

if [ -n "${JAVA_OPTS}" ]; then
  set -- "$@" ${JAVA_OPTS}
fi

if [ -n "${JVM_OPTS}" ]; then
  set -- "$@" ${JVM_OPTS}
fi

set +f

if [ -n "${JAVA_XMS}" ]; then
  set -- "$@" "-Xms${JAVA_XMS}"
fi

if [ -n "${JAVA_XMX}" ]; then
  set -- "$@" "-Xmx${JAVA_XMX}"
fi

set -- "$@" -jar "${SERVER_JAR}" nogui

"$@" <&3 &
MC_PID=$!

echo "${MC_PID}" > "${PID_FILE}"
log "Server PID: ${MC_PID}"
log "Launching server..."

EXIT_CODE=0

while :; do
  if wait "${MC_PID}"; then
    EXIT_CODE=0
    break
  fi

  EXIT_CODE=$?

  if kill -0 "${MC_PID}" 2>/dev/null; then
    continue
  fi

  break
done

log "Minecraft server exited with code ${EXIT_CODE}"
exit "${EXIT_CODE}"
