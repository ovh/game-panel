#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
GMOD_INSTALL_DIR="${GMOD_INSTALL_DIR:-${DATA_DIR}/server}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/garrys-mod}"
STEAMCMD_DIR="${STEAMCMD_DIR:-/opt/steamcmd}"
GMOD_STEAM_APP_ID="${GMOD_STEAM_APP_ID:-4020}"
GMOD_BRANCH="${GMOD_BRANCH:-x86-64}"
GMOD_UPDATE_ON_START="${GMOD_UPDATE_ON_START:-true}"
GMOD_VALIDATE_ON_START="${GMOD_VALIDATE_ON_START:-false}"
GMOD_MOUNT_CSS="${GMOD_MOUNT_CSS:-false}"
GMOD_CSS_STEAM_APP_ID="${GMOD_CSS_STEAM_APP_ID:-232330}"
GMOD_CSS_INSTALL_DIR="${GMOD_CSS_INSTALL_DIR:-${DATA_DIR}/content/counter-strike-source}"
GMOD_START_PARAMS="${GMOD_START_PARAMS:-}"
LOG_PREFIX="[gmod]"

. /app/common.sh

GMOD_SERVER_BIN="${GMOD_SERVER_BIN:-$(gmod_server_binary)}"
STEAMCMD_BIN="${STEAMCMD_DIR}/steamcmd.sh"

log "Starting bootstrap..."

if [ "$#" -gt 0 ]; then
  log "Custom command requested, bypassing server bootstrap."
  exec "$@"
fi

assert_safe_data_dir
assert_writable_dir "${DATA_DIR}"
assert_writable_dir "${RUNTIME_DIR}"
assert_writable_dir "${GMOD_INSTALL_DIR}"

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

run_steamcmd_app_update() {
  STEAMCMD_APP_ID="$1"
  STEAMCMD_APP_DIR="$2"
  STEAMCMD_APP_BRANCH="$3"
  STEAMCMD_APP_VALIDATE="$4"

  set -- "${STEAMCMD_BIN}" \
    +force_install_dir "${STEAMCMD_APP_DIR}" \
    +login anonymous \
    +app_update "${STEAMCMD_APP_ID}"

  if [ -n "${STEAMCMD_APP_BRANCH}" ]; then
    set -- "$@" -beta "${STEAMCMD_APP_BRANCH}"
  fi

  if [ "${STEAMCMD_APP_VALIDATE}" = "true" ]; then
    set -- "$@" validate
  fi

  set -- "$@" +quit

  STEAMCMD_MAX_ATTEMPTS="${STEAMCMD_MAX_ATTEMPTS:-5}"
  STEAMCMD_RETRY_DELAY_SECONDS="${STEAMCMD_RETRY_DELAY_SECONDS:-10}"
  ATTEMPT=1
  STEAMCMD_OUTPUT="$(mktemp "${RUNTIME_DIR}/steamcmd-output.XXXXXX")"
  STEAMCMD_EXIT_CODE_FILE="${STEAMCMD_OUTPUT}.exit-code"

  while :; do
    : > "${STEAMCMD_OUTPUT}"
    rm -f "${STEAMCMD_EXIT_CODE_FILE}"

    (
      set +e
      "$@"
      printf '%s\n' "$?" > "${STEAMCMD_EXIT_CODE_FILE}"
    ) 2>&1 | tee "${STEAMCMD_OUTPUT}"

    if [ ! -f "${STEAMCMD_EXIT_CODE_FILE}" ]; then
      rm -f "${STEAMCMD_OUTPUT}"
      die "SteamCMD exit code could not be determined."
    fi

    STEAMCMD_EXIT_CODE="$(cat "${STEAMCMD_EXIT_CODE_FILE}")"

    if [ "${STEAMCMD_EXIT_CODE}" -eq 0 ]; then
      rm -f "${STEAMCMD_OUTPUT}" "${STEAMCMD_EXIT_CODE_FILE}"
      break
    fi

    if ! grep -Fq "Failed to install app '${STEAMCMD_APP_ID}' (Missing configuration)" "${STEAMCMD_OUTPUT}"; then
      rm -f "${STEAMCMD_OUTPUT}" "${STEAMCMD_EXIT_CODE_FILE}"
      die "SteamCMD failed with exit code ${STEAMCMD_EXIT_CODE}."
    fi

    if [ "${ATTEMPT}" -ge "${STEAMCMD_MAX_ATTEMPTS}" ]; then
      rm -f "${STEAMCMD_OUTPUT}" "${STEAMCMD_EXIT_CODE_FILE}"
      die "SteamCMD failed after ${ATTEMPT} attempt(s) with the known transient 'Missing configuration' error."
    fi

    log "SteamCMD attempt ${ATTEMPT}/${STEAMCMD_MAX_ATTEMPTS} failed with the known transient 'Missing configuration' error; retrying in ${STEAMCMD_RETRY_DELAY_SECONDS}s..."
    ATTEMPT=$((ATTEMPT + 1))
    sleep "${STEAMCMD_RETRY_DELAY_SECONDS}"
  done
}

install_or_update_gmod() {
  UPDATE_REASON=""
  VALIDATE_APP="false"

  if [ ! -x "${GMOD_SERVER_BIN}" ]; then
    UPDATE_REASON="server launcher is missing"
    VALIDATE_APP="true"
  elif is_truthy "${GMOD_UPDATE_ON_START}"; then
    UPDATE_REASON="GMOD_UPDATE_ON_START is enabled"
  fi

  if is_truthy "${GMOD_VALIDATE_ON_START}"; then
    VALIDATE_APP="true"
  fi

  if [ -z "${UPDATE_REASON}" ] && [ "${VALIDATE_APP}" != "true" ]; then
    log "Found existing Garry's Mod installation, skipping SteamCMD update."
    return 0
  fi

  if [ -n "${UPDATE_REASON}" ]; then
    log "Running SteamCMD update because ${UPDATE_REASON}."
  else
    log "Running SteamCMD validation."
  fi

  if [ -n "${GMOD_BRANCH}" ]; then
    log "Using Steam branch '${GMOD_BRANCH}'."
  fi

  run_steamcmd_app_update "${GMOD_STEAM_APP_ID}" "${GMOD_INSTALL_DIR}" "${GMOD_BRANCH}" "${VALIDATE_APP}"
}

install_or_update_css_content() {
  CSS_CONTENT_DIR="${GMOD_CSS_INSTALL_DIR}/cstrike"
  CSS_VALIDATE_APP="false"

  if ! is_truthy "${GMOD_MOUNT_CSS}"; then
    remove_gmod_mount_entry "cstrike" "${CSS_CONTENT_DIR}"
    return 0
  fi

  if is_truthy "${GMOD_VALIDATE_ON_START}"; then
    CSS_VALIDATE_APP="true"
  fi

  assert_writable_dir "${GMOD_CSS_INSTALL_DIR}"

  if [ -d "${CSS_CONTENT_DIR}" ] && [ "${CSS_VALIDATE_APP}" != "true" ]; then
    log "Found existing Counter-Strike: Source content, skipping SteamCMD update."
  else
    log "Installing Counter-Strike: Source content because GMOD_MOUNT_CSS is enabled."
    run_steamcmd_app_update "${GMOD_CSS_STEAM_APP_ID}" "${GMOD_CSS_INSTALL_DIR}" "" "${CSS_VALIDATE_APP}"
  fi

  if [ ! -d "${CSS_CONTENT_DIR}" ]; then
    die "Counter-Strike: Source content directory is missing after install: ${CSS_CONTENT_DIR}"
  fi

  ensure_gmod_mount_entry "cstrike" "${CSS_CONTENT_DIR}"
}

install_or_update_gmod

setup_steam_runtime_paths

if [ ! -x "${GMOD_SERVER_BIN}" ]; then
  die "Garry's Mod server launcher is not executable after install/update: ${GMOD_SERVER_BIN}"
fi

install_or_update_css_content

mkdir -p "$(gmod_game_dir)/cache"

export DATA_DIR
export GMOD_INSTALL_DIR
export GMOD_SERVER_BIN
export RUNTIME_DIR
export GMOD_START_PARAMS

log "Bootstrap complete, handing over to launcher..."
exec /app/launcher.sh
