#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
CS2_INSTALL_DIR="${CS2_INSTALL_DIR:-${DATA_DIR}/server}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/counter-strike2}"
STEAMCMD_DIR="${STEAMCMD_DIR:-/opt/steamcmd}"
CS2_STEAM_APP_ID="${CS2_STEAM_APP_ID:-730}"
CS2_UPDATE_ON_START="${CS2_UPDATE_ON_START:-true}"
CS2_VALIDATE_ON_START="${CS2_VALIDATE_ON_START:-false}"
CS2_START_PARAMS="${CS2_START_PARAMS:-}"
LOG_PREFIX="[cs2]"

. /app/common.sh

CS2_SERVER_BIN="${CS2_SERVER_BIN:-${CS2_INSTALL_DIR}/game/bin/linuxsteamrt64/cs2}"
STEAMCMD_BIN="${STEAMCMD_DIR}/steamcmd.sh"

log "Starting bootstrap..."

if [ "$#" -gt 0 ]; then
  log "Custom command requested, bypassing server bootstrap."
  exec "$@"
fi

assert_safe_data_dir
assert_writable_dir "${DATA_DIR}"
assert_writable_dir "${RUNTIME_DIR}"
assert_writable_dir "${CS2_INSTALL_DIR}"

if [ ! -x "${STEAMCMD_BIN}" ]; then
  die "SteamCMD executable not found: ${STEAMCMD_BIN}"
fi

setup_steam_runtime_paths() {
  mkdir -p "${HOME}/.steam/sdk64" "${HOME}/.steam/sdk32"

  if [ -f "${STEAMCMD_DIR}/linux64/steamclient.so" ]; then
    ln -sf "${STEAMCMD_DIR}/linux64/steamclient.so" "${HOME}/.steam/sdk64/steamclient.so"
  fi

  if [ -f "${STEAMCMD_DIR}/linux32/steamclient.so" ]; then
    ln -sf "${STEAMCMD_DIR}/linux32/steamclient.so" "${HOME}/.steam/sdk32/steamclient.so"
  fi
}

install_or_update_cs2() {
  UPDATE_REASON=""
  VALIDATE_APP="false"

  if [ ! -x "${CS2_SERVER_BIN}" ]; then
    UPDATE_REASON="server binary is missing"
    VALIDATE_APP="true"
  elif is_truthy "${CS2_UPDATE_ON_START}"; then
    UPDATE_REASON="CS2_UPDATE_ON_START is enabled"
  fi

  if is_truthy "${CS2_VALIDATE_ON_START}"; then
    VALIDATE_APP="true"
  fi

  if [ -z "${UPDATE_REASON}" ] && [ "${VALIDATE_APP}" != "true" ]; then
    log "Found existing CS2 installation, skipping SteamCMD update."
    return 0
  fi

  if [ -n "${UPDATE_REASON}" ]; then
    log "Running SteamCMD update because ${UPDATE_REASON}."
  else
    log "Running SteamCMD validation."
  fi

  set -- "${STEAMCMD_BIN}" \
    +force_install_dir "${CS2_INSTALL_DIR}" \
    +login anonymous \
    +app_update "${CS2_STEAM_APP_ID}"

  if [ "${VALIDATE_APP}" = "true" ]; then
    set -- "$@" validate
  fi

  set -- "$@" +quit

  STEAMCMD_MAX_ATTEMPTS="${STEAMCMD_MAX_ATTEMPTS:-5}"
  STEAMCMD_RETRY_DELAY_SECONDS="${STEAMCMD_RETRY_DELAY_SECONDS:-10}"
  ATTEMPT=1

  while :; do
    if "$@"; then
      break
    fi

    if [ "${ATTEMPT}" -ge "${STEAMCMD_MAX_ATTEMPTS}" ]; then
      die "SteamCMD failed after ${ATTEMPT} attempt(s)."
    fi

    log "SteamCMD attempt ${ATTEMPT}/${STEAMCMD_MAX_ATTEMPTS} failed (known transient SteamCMD 'Missing configuration' error on a cold cache); retrying in ${STEAMCMD_RETRY_DELAY_SECONDS}s..."
    ATTEMPT=$((ATTEMPT + 1))
    sleep "${STEAMCMD_RETRY_DELAY_SECONDS}"
  done
}

install_or_update_cs2

setup_steam_runtime_paths

if [ ! -x "${CS2_SERVER_BIN}" ]; then
  die "CS2 server binary is not executable after install/update: ${CS2_SERVER_BIN}"
fi

if metamod_is_installed; then
  ensure_metamod_gameinfo_entry
fi

write_gameserver_metadata

export DATA_DIR
export CS2_INSTALL_DIR
export CS2_SERVER_BIN
export RUNTIME_DIR
export CS2_START_PARAMS

log "Bootstrap complete, handing over to launcher..."
exec /app/launcher.sh
