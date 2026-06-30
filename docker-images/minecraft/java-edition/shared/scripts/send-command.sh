#!/bin/sh
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft}"
LOG_PREFIX="[mc-cmd]"

. /app/common.sh

FIFO="$(minecraft_fifo_path)"
PID_FILE="$(minecraft_pid_file_path)"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <minecraft command>"
  exit 1
fi

COMMAND="$*"

if [ ! -p "${FIFO}" ]; then
  die "FIFO not found: ${FIFO}"
fi

if [ ! -f "${PID_FILE}" ]; then
  die "Server PID file not found: ${PID_FILE}"
fi

if RUNNING_PID="$(read_minecraft_pid)"; then
  :
else
  die "Server PID file is invalid: ${PID_FILE}"
fi

if ! kill -0 "${RUNNING_PID}" 2>/dev/null; then
  die "Minecraft server is not running."
fi

printf '%s\n' "${COMMAND}" > "${FIFO}"
log "Sent command: ${COMMAND}"
