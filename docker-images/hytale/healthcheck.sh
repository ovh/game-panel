#!/bin/sh
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/run/hytale}"
LOG_PREFIX="[hytale-health]"

HEALTHCHECK_PORT="${HEALTHCHECK_PORT:-${HYTALE_PORT:-5520}}"
HEALTHCHECK_REQUIRE_BIND="${HEALTHCHECK_REQUIRE_BIND:-true}"

. /app/common.sh

if ! is_hytale_server_running; then
  die "Hytale server process is not running."
fi

if is_truthy "${HEALTHCHECK_REQUIRE_BIND}"; then
  if ! ss -H -u -l -n "sport = :${HEALTHCHECK_PORT}" 2>/dev/null | grep -q .; then
    die "Hytale game port ${HEALTHCHECK_PORT}/udp is not bound yet."
  fi
fi
