#!/bin/sh
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/run/counter-strike2}"
LOG_PREFIX="[cs2-health]"

HEALTHCHECK_HOST="${HEALTHCHECK_HOST:-}"
HEALTHCHECK_PORT="${HEALTHCHECK_PORT:-27015}"
HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-2}"
HEALTHCHECK_REQUIRE_TCP="${HEALTHCHECK_REQUIRE_TCP:-true}"

. /app/common.sh

if ! is_cs2_server_running; then
  die "CS2 server process is not running."
fi

if is_truthy "${HEALTHCHECK_REQUIRE_TCP}"; then
  if [ -z "${HEALTHCHECK_HOST}" ]; then
    HEALTHCHECK_HOST="$(hostname -i | awk '{print $1}')"
  fi

  if [ -z "${HEALTHCHECK_HOST}" ]; then
    die "Could not resolve container IP for TCP healthcheck."
  fi

  if ! nc -z -w "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" "${HEALTHCHECK_HOST}" "${HEALTHCHECK_PORT}" >/dev/null 2>&1; then
    die "CS2 server port is not accepting TCP connections at ${HEALTHCHECK_HOST}:${HEALTHCHECK_PORT}."
  fi
fi
