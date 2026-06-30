#!/bin/sh
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/run/counter-strike2}"
LOG_PREFIX="[cs2-cmd]"

. /app/common.sh

FIFO="$(cs2_fifo_path)"
PID_FILE="$(cs2_pid_file_path)"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <cs2 command>"
  exit 1
fi

COMMAND="$*"

if [ ! -p "${FIFO}" ]; then
  die "FIFO not found: ${FIFO}"
fi

if [ ! -f "${PID_FILE}" ]; then
  die "Server PID file not found: ${PID_FILE}"
fi

if RUNNING_PID="$(read_cs2_pid)"; then
  :
else
  die "Server PID file is invalid: ${PID_FILE}"
fi

if ! kill -0 "${RUNNING_PID}" 2>/dev/null; then
  die "Counter-Strike 2 server is not running."
fi

printf '%s\n' "${COMMAND}" > "${FIFO}"
log "Sent command: ${COMMAND}"
