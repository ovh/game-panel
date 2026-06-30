#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
HYTALE_GAME_DIR="${HYTALE_GAME_DIR:-${DATA_DIR}/game}"
HYTALE_SERVER_DIR="${HYTALE_SERVER_DIR:-${HYTALE_GAME_DIR}/Server}"
HYTALE_START_SCRIPT="${HYTALE_START_SCRIPT:-${HYTALE_GAME_DIR}/start.sh}"
HYTALE_ASSETS_ZIP="${HYTALE_ASSETS_ZIP:-${HYTALE_GAME_DIR}/Assets.zip}"
HYTALE_SERVER_JAR="${HYTALE_SERVER_JAR:-${HYTALE_SERVER_DIR}/HytaleServer.jar}"
HYTALE_JVM_OPTIONS_FILE="${HYTALE_JVM_OPTIONS_FILE:-${HYTALE_GAME_DIR}/jvm.options}"
HYTALE_WRITE_JVM_OPTIONS="${HYTALE_WRITE_JVM_OPTIONS:-true}"
HYTALE_GAMEPANEL_PLUGIN_JAR="${HYTALE_GAMEPANEL_PLUGIN_JAR:-/app/gamepanel-hytale-credential-store.jar}"
HYTALE_VERSION="${HYTALE_VERSION:-}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/hytale}"
LOG_PREFIX="[hytale]"

. /app/common.sh

log "Starting bootstrap..."

if [ "$#" -gt 0 ]; then
  log "Custom command requested, bypassing server bootstrap."
  exec "$@"
fi

assert_safe_data_dir
assert_writable_dir "${DATA_DIR}"
assert_writable_dir "${RUNTIME_DIR}"

if [ ! -f "${HYTALE_START_SCRIPT}" ]; then
  die "Hytale start script not found: ${HYTALE_START_SCRIPT}. The backend must prepare /data/game before starting this image."
fi

if [ ! -x "${HYTALE_START_SCRIPT}" ]; then
  chmod +x "${HYTALE_START_SCRIPT}" 2>/dev/null || die "Hytale start script is not executable and cannot be fixed: ${HYTALE_START_SCRIPT}"
fi

if [ ! -f "${HYTALE_ASSETS_ZIP}" ]; then
  die "Hytale assets archive not found: ${HYTALE_ASSETS_ZIP}"
fi

if [ ! -f "${HYTALE_SERVER_JAR}" ]; then
  die "Hytale server jar not found: ${HYTALE_SERVER_JAR}"
fi

if [ ! -f "${HYTALE_GAMEPANEL_PLUGIN_JAR}" ]; then
  die "Game Panel Hytale credential store plugin not found: ${HYTALE_GAMEPANEL_PLUGIN_JAR}"
fi

install_gamepanel_credential_store_plugin() {
  mkdir -p "${HYTALE_SERVER_DIR}/mods"

  plugin_dest="${HYTALE_SERVER_DIR}/mods/gamepanel-hytale-credential-store.jar"
  plugin_source="${HYTALE_GAMEPANEL_PLUGIN_JAR}"
  plugin_to_install="${plugin_source}"
  tmp_dir=""

  if [ -n "${HYTALE_VERSION}" ]; then
    tmp_dir="$(mktemp -d "${RUNTIME_DIR}/gamepanel-plugin.XXXXXX")"
    patched_jar="${tmp_dir}/gamepanel-hytale-credential-store.jar"

    cp "${plugin_source}" "${patched_jar}"
    unzip -p "${plugin_source}" manifest.json \
      | jq --arg serverVersion "=${HYTALE_VERSION}" '.ServerVersion = $serverVersion' \
      > "${tmp_dir}/manifest.json"

    (
      cd "${tmp_dir}"
      zip -q "${patched_jar}" manifest.json
    )

    plugin_to_install="${patched_jar}"
  else
    log "HYTALE_VERSION is not set; installing credential store plugin without ServerVersion."
  fi

  if [ ! -f "${plugin_dest}" ] || ! cmp -s "${plugin_to_install}" "${plugin_dest}"; then
    cp "${plugin_to_install}" "${plugin_dest}"
    if [ -n "${HYTALE_VERSION}" ]; then
      log "Installed Game Panel credential store plugin for Hytale ${HYTALE_VERSION}."
    else
      log "Installed Game Panel credential store plugin."
    fi
  fi

  if [ -n "${tmp_dir}" ]; then
    rm -rf "${tmp_dir}"
  fi
}

install_gamepanel_credential_store_plugin

if is_truthy "${HYTALE_WRITE_JVM_OPTIONS}"; then
  write_hytale_jvm_options
fi

write_gameserver_metadata

export DATA_DIR
export HYTALE_GAME_DIR
export HYTALE_SERVER_DIR
export HYTALE_START_SCRIPT
export HYTALE_ASSETS_ZIP
export HYTALE_SERVER_JAR
export HYTALE_GAMEPANEL_PLUGIN_JAR
export RUNTIME_DIR

log "Bootstrap complete, handing over to launcher..."
exec /app/launcher.sh
