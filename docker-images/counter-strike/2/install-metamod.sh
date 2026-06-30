#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
CS2_INSTALL_DIR="${CS2_INSTALL_DIR:-${DATA_DIR}/server}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/counter-strike2}"
METAMOD_VERSION_INPUT="${1:-${METAMOD_VERSION:-latest}}"
METAMOD_RELEASES_API="${METAMOD_RELEASES_API:-https://api.github.com/repos/alliedmodders/metamod-source/releases}"
METAMOD_RELEASE_PREFIX="${METAMOD_RELEASE_PREFIX:-2.0.}"
METAMOD_GAMEINFO_MODE="${METAMOD_GAMEINFO_MODE:-ensure}"
LOG_PREFIX="[cs2-metamod]"

. /app/common.sh

WORK_DIR=""
cleanup() {
  [ -n "${WORK_DIR}" ] && [ -d "${WORK_DIR}" ] && rm -rf "${WORK_DIR}" 2>/dev/null
  return 0
}
trap cleanup EXIT INT TERM HUP

resolve_metamod_download() {
  releases_json="$(github_api_to_stdout "${METAMOD_RELEASES_API}?per_page=100")" \
    || die "Could not query the Metamod releases API."

  if [ "${METAMOD_VERSION_INPUT}" = "latest" ]; then
    METAMOD_DOWNLOAD_URL="$(printf '%s' "${releases_json}" | jq -r --arg p "${METAMOD_RELEASE_PREFIX}" '
      [ .[] | select(.tag_name | startswith($p)) ]
      | map(. + { _build: (.tag_name | split(".") | last | tonumber? // 0) })
      | sort_by(._build) | last
      | (.assets[]? | select(.name | test("-linux\\.tar\\.gz$")) | .browser_download_url) // empty
    ')"
  else
    METAMOD_DOWNLOAD_URL="$(printf '%s' "${releases_json}" | jq -r --arg v "${METAMOD_VERSION_INPUT}" '
      [ .[]
        | select(
            .tag_name == $v
            or .tag_name == ("2.0.0." + $v)
            or (.tag_name | endswith("." + $v))
          )
      ]
      | first
      | (.assets[]? | select(.name | test("-linux\\.tar\\.gz$")) | .browser_download_url) // empty
    ')"
  fi

  [ -n "${METAMOD_DOWNLOAD_URL}" ] && [ "${METAMOD_DOWNLOAD_URL}" != "null" ] \
    || die "Could not resolve a Metamod ${METAMOD_RELEASE_PREFIX}x Linux release for '${METAMOD_VERSION_INPUT}' from GitHub."
  METAMOD_ARCHIVE_NAME="$(basename "${METAMOD_DOWNLOAD_URL}")"
}

assert_safe_data_dir
[ -f "$(cs2_gameinfo_file)" ] || die "CS2 is not installed (gameinfo.gi missing): $(cs2_gameinfo_file)"
assert_writable_dir "$(cs2_csgo_dir)"

if is_cs2_server_running; then
  die "CS2 server is running in this container. Stop it before installing Metamod."
fi

resolve_metamod_download

log "Installing Metamod:Source for CS2."
log "Requested version: ${METAMOD_VERSION_INPUT}"
log "Resolved archive: ${METAMOD_ARCHIVE_NAME}"
log "Download URL: ${METAMOD_DOWNLOAD_URL}"

if metamod_is_installed; then
  log "Existing Metamod detected -> applying overlay update."
else
  log "No Metamod detected -> fresh install."
fi

WORK_DIR="$(mktemp -d "${RUNTIME_DIR}/metamod-install.XXXXXX")"
ARCHIVE_PATH="${WORK_DIR}/metamod.tar.gz"
STAGE_DIR="${WORK_DIR}/stage"
CSGO_ADDONS_DIR="$(cs2_csgo_dir)/addons"

download_to_file "${METAMOD_DOWNLOAD_URL}" "${ARCHIVE_PATH}"

mkdir -p "${STAGE_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${STAGE_DIR}"

[ -d "${STAGE_DIR}/addons/metamod" ] || die "Downloaded archive is missing addons/metamod."
[ -f "${STAGE_DIR}/addons/metamod/bin/linuxsteamrt64/metamod.2.cs2.so" ] || die "Downloaded archive is missing the CS2 Linux plugin binary."

mkdir -p "${CSGO_ADDONS_DIR}"
cp -a "${STAGE_DIR}/addons/." "${CSGO_ADDONS_DIR}/"

ensure_metamod_gameinfo_entry "${METAMOD_GAMEINFO_MODE}"

metamod_is_installed || die "Metamod files copied, but the plugin binary is still missing."

log "Metamod installation completed successfully."
