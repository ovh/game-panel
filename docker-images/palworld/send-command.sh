#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
PALWORLD_INSTALL_DIR="${PALWORLD_INSTALL_DIR:-${DATA_DIR}/server}"
LOG_PREFIX="[palworld-cmd]"

. /app/common.sh

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <command> [args]" >&2
  echo "Commands: info | players | settings | metrics | save | stop |" >&2
  echo "          announce <message> | kick <userid> [reason] | ban <userid> [reason] |" >&2
  echo "          unban <userid> | shutdown <seconds> [message]" >&2
  exit 1
fi

if ! is_palworld_server_running; then
  die "Palworld server is not running; cannot reach the REST API."
fi

COMMAND="$*"
VERB="$(printf '%s' "${COMMAND%% *}" | tr '[:upper:]' '[:lower:]')"

case "${COMMAND}" in
  *" "*) ARGS="${COMMAND#* }" ;;
  *) ARGS="" ;;
esac

ARG1="${ARGS%% *}"
case "${ARGS}" in
  *" "*) ARG_REST="${ARGS#* }" ;;
  *) ARG_REST="" ;;
esac

case "${VERB}" in
  info|players|settings|metrics)
    palworld_api "GET" "${VERB}"
    ;;
  save|stop)
    palworld_api "POST" "${VERB}"
    ;;
  announce|broadcast)
    [ -n "${ARGS}" ] || die "Usage: announce <message>"
    palworld_api "POST" "announce" "$(jq -nc --arg m "${ARGS}" '{message: $m}')"
    ;;
  kick|ban)
    [ -n "${ARG1}" ] || die "Usage: ${VERB} <userid> [reason]"
    palworld_api "POST" "${VERB}" "$(jq -nc --arg u "${ARG1}" --arg m "${ARG_REST}" '{userid: $u, message: $m}')"
    ;;
  unban)
    [ -n "${ARG1}" ] || die "Usage: unban <userid>"
    palworld_api "POST" "unban" "$(jq -nc --arg u "${ARG1}" '{userid: $u}')"
    ;;
  shutdown)
    [ -n "${ARG1}" ] || die "Usage: shutdown <seconds> [message]"
    case "${ARG1}" in ''|*[!0-9]*) die "shutdown <seconds> must be a number." ;; esac
    palworld_api "POST" "shutdown" "$(jq -nc --argjson w "${ARG1}" --arg m "${ARG_REST}" '{waittime: $w, message: $m}')"
    ;;
  *)
    die "Unknown command '${VERB}'. Supported: info, players, settings, metrics, save, stop, announce, kick, ban, unban, shutdown."
    ;;
esac
