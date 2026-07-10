#!/bin/sh
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/run/palworld}"
LOG_PREFIX="[palworld-health]"

HEALTHCHECK_PORT="${HEALTHCHECK_PORT:-8211}"
HEALTHCHECK_REQUIRE_BIND="${HEALTHCHECK_REQUIRE_BIND:-true}"

. /app/common.sh

if ! is_palworld_server_running; then
  die "Palworld server process is not running."
fi

if is_truthy "${HEALTHCHECK_REQUIRE_BIND}"; then
  if ! ss -H -u -l -n "sport = :${HEALTHCHECK_PORT}" 2>/dev/null | grep -q .; then
    die "Palworld game port ${HEALTHCHECK_PORT}/udp is not bound yet."
  fi
fi
