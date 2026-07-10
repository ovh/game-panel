#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
PALWORLD_INSTALL_DIR="${PALWORLD_INSTALL_DIR:-${DATA_DIR}/server}"
LOG_PREFIX="[palworld-backup]"

. /app/common.sh

if ! is_palworld_server_running; then
  die "Palworld server is not running; cannot trigger a save."
fi

log "Requesting an on-demand world save via the REST API..."
palworld_api "POST" "save"
log "Save request sent."
