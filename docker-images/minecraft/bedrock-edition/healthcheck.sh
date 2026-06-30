#!/bin/sh
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft-bedrock}"
LOG_PREFIX="[bedrock-health]"

. /app/common.sh

if ! is_bedrock_server_running; then
  die "Bedrock server process is not running."
fi
