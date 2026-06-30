#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
CS2_INSTALL_DIR="${CS2_INSTALL_DIR:-${DATA_DIR}/server}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/counter-strike2}"
METAMOD_GAMEINFO_MODE="${METAMOD_GAMEINFO_MODE:-ensure}"
LOG_PREFIX="[cs2-frameworks]"

. /app/common.sh

assert_safe_data_dir
assert_cs2_install_layout
assert_writable_dir "${DATA_DIR}"
assert_writable_dir "${CS2_INSTALL_DIR}"
assert_writable_dir "$(cs2_csgo_dir)"

if is_cs2_server_running; then
  die "CS2 server is running in this container. Stop it before repairing frameworks."
fi

METAMOD_PRESENT="false"
COUNTERSTRIKESHARP_PRESENT="false"

if metamod_is_installed; then
  METAMOD_PRESENT="true"
fi

if counterstrikesharp_is_installed; then
  COUNTERSTRIKESHARP_PRESENT="true"
fi

log "Starting CS2 framework repair..."
log "Metamod installed: ${METAMOD_PRESENT}"
log "CounterStrikeSharp installed: ${COUNTERSTRIKESHARP_PRESENT}"

if [ "${COUNTERSTRIKESHARP_PRESENT}" = "true" ] && [ "${METAMOD_PRESENT}" != "true" ]; then
  die "CounterStrikeSharp files are present, but Metamod is missing."
fi

if [ "${METAMOD_PRESENT}" = "true" ]; then
  ensure_metamod_gameinfo_entry "${METAMOD_GAMEINFO_MODE}"
else
  log "Metamod is not installed. Skipping gameinfo.gi reconciliation."
fi

log "CS2 framework repair completed successfully."
