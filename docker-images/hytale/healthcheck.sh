#!/bin/sh
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/run/hytale}"
LOG_PREFIX="[hytale-health]"

. /app/common.sh

if ! is_hytale_server_running; then
  die "Hytale server process is not running."
fi

