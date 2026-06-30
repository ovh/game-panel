#!/bin/sh
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft}"
LOG_PREFIX="[mc-health]"

HEALTHCHECK_HOST="${HEALTHCHECK_HOST:-127.0.0.1}"
HEALTHCHECK_PORT="${HEALTHCHECK_PORT:-25565}"
HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-2}"
HEALTHCHECK_REQUIRE_TCP="${HEALTHCHECK_REQUIRE_TCP:-true}"

. /app/common.sh

if ! is_minecraft_server_running; then
  die "Minecraft server process is not running."
fi

if is_truthy "${HEALTHCHECK_REQUIRE_TCP}"; then
  if ! nc -z -w "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" "${HEALTHCHECK_HOST}" "${HEALTHCHECK_PORT}" >/dev/null 2>&1; then
    die "Minecraft server port is not accepting TCP connections at ${HEALTHCHECK_HOST}:${HEALTHCHECK_PORT}."
  fi
fi
