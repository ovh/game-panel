#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
CS2_INSTALL_DIR="${CS2_INSTALL_DIR:-${DATA_DIR}/server}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/counter-strike2}"
COUNTERSTRIKESHARP_VERSION_INPUT="${1:-${COUNTERSTRIKESHARP_VERSION:-latest}}"
COUNTERSTRIKESHARP_RELEASE_FLAVOR="${COUNTERSTRIKESHARP_RELEASE_FLAVOR:-with-runtime}"
COUNTERSTRIKESHARP_REPOSITORY="${COUNTERSTRIKESHARP_REPOSITORY:-roflmuffin/CounterStrikeSharp}"
COUNTERSTRIKESHARP_API_BASE="${COUNTERSTRIKESHARP_API_BASE:-https://api.github.com/repos/${COUNTERSTRIKESHARP_REPOSITORY}/releases}"
METAMOD_GAMEINFO_MODE="${METAMOD_GAMEINFO_MODE:-ensure}"
LOG_PREFIX="[cs2-css]"

. /app/common.sh

WORK_DIR=""

cleanup() {
  if [ -n "${WORK_DIR}" ] && [ -d "${WORK_DIR}" ]; then
    rm -rf "${WORK_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

normalize_release_flavor() {
  case "${COUNTERSTRIKESHARP_RELEASE_FLAVOR}" in
    auto)
      if counterstrikesharp_is_installed && [ -x "$(cs2_csgo_dir)/addons/counterstrikesharp/dotnet/dotnet" ]; then
        printf '%s\n' "normal"
      else
        printf '%s\n' "with-runtime"
      fi
      ;;
    with-runtime|normal)
      printf '%s\n' "${COUNTERSTRIKESHARP_RELEASE_FLAVOR}"
      ;;
    *)
      die "Unsupported COUNTERSTRIKESHARP_RELEASE_FLAVOR: ${COUNTERSTRIKESHARP_RELEASE_FLAVOR}. Expected one of: with-runtime, normal, auto."
      ;;
  esac
}

resolve_release_api_url() {
  if [ "${COUNTERSTRIKESHARP_VERSION_INPUT}" = "latest" ]; then
    printf '%s\n' "${COUNTERSTRIKESHARP_API_BASE}/latest"
    return 0
  fi

  case "${COUNTERSTRIKESHARP_VERSION_INPUT}" in
    v*)
      CSS_TAG="${COUNTERSTRIKESHARP_VERSION_INPUT}"
      ;;
    *)
      CSS_TAG="v${COUNTERSTRIKESHARP_VERSION_INPUT}"
      ;;
  esac

  printf '%s\n' "${COUNTERSTRIKESHARP_API_BASE}/tags/${CSS_TAG}"
}

FRAMEWORKS_TMP_BASE="$(frameworks_tmp_dir)"

assert_safe_data_dir
assert_cs2_install_layout
assert_writable_dir "${DATA_DIR}"
assert_writable_dir "${CS2_INSTALL_DIR}"
assert_writable_dir "$(cs2_csgo_dir)"
mkdir -p "${FRAMEWORKS_TMP_BASE}"

if is_cs2_server_running; then
  die "CS2 server is running in this container. Stop it before installing CounterStrikeSharp."
fi

if ! metamod_is_installed; then
  die "Metamod must be installed before CounterStrikeSharp."
fi

ensure_metamod_gameinfo_entry "${METAMOD_GAMEINFO_MODE}"

WORK_DIR="$(mktemp -d "${FRAMEWORKS_TMP_BASE}/css-install.XXXXXX")"
ARCHIVE_PATH="${WORK_DIR}/counterstrikesharp.zip"
STAGE_DIR="${WORK_DIR}/stage"
CSGO_ADDONS_DIR="$(cs2_csgo_dir)/addons"
CSS_EFFECTIVE_FLAVOR="$(normalize_release_flavor)"
RELEASE_API_URL="$(resolve_release_api_url)"

log "Starting CounterStrikeSharp installation..."
log "Requested version: ${COUNTERSTRIKESHARP_VERSION_INPUT}"
log "Requested release flavor: ${COUNTERSTRIKESHARP_RELEASE_FLAVOR}"
log "Effective release flavor: ${CSS_EFFECTIVE_FLAVOR}"

RELEASE_JSON="$(github_api_to_stdout "${RELEASE_API_URL}")"
CSS_RESOLVED_TAG="$(printf '%s' "${RELEASE_JSON}" | jq -r '.tag_name // empty')"
[ -n "${CSS_RESOLVED_TAG}" ] || die "Could not resolve a CounterStrikeSharp release tag from ${RELEASE_API_URL}."

if [ "${CSS_EFFECTIVE_FLAVOR}" = "normal" ] && [ ! -x "$(cs2_csgo_dir)/addons/counterstrikesharp/dotnet/dotnet" ]; then
  die "COUNTERSTRIKESHARP_RELEASE_FLAVOR=normal requires an existing CounterStrikeSharp runtime. Use with-runtime for the first install."
fi

CSS_ASSET_INFO="$(printf '%s' "${RELEASE_JSON}" | jq -r --arg flavor "${CSS_EFFECTIVE_FLAVOR}" '
  .assets[]
  | select(
      if $flavor == "with-runtime" then
        .name | test("^counterstrikesharp-with-runtime-linux-[^/]+\\.zip$")
      else
        .name | test("^counterstrikesharp-linux-[^/]+\\.zip$")
      end
    )
  | .name + "|" + .browser_download_url
' | head -n1)"

[ -n "${CSS_ASSET_INFO}" ] || die "Could not find a Linux CounterStrikeSharp release asset for flavor '${CSS_EFFECTIVE_FLAVOR}' in ${CSS_RESOLVED_TAG}."

CSS_ASSET_NAME="${CSS_ASSET_INFO%%|*}"
CSS_DOWNLOAD_URL="${CSS_ASSET_INFO#*|}"

log "Resolved release tag: ${CSS_RESOLVED_TAG}"
log "Resolved asset: ${CSS_ASSET_NAME}"
log "Download URL: ${CSS_DOWNLOAD_URL}"

if counterstrikesharp_is_installed; then
  log "Existing CounterStrikeSharp installation detected. Applying overlay update."
else
  log "No CounterStrikeSharp installation detected. Installing fresh files."
fi

download_to_file "${CSS_DOWNLOAD_URL}" "${ARCHIVE_PATH}"

mkdir -p "${STAGE_DIR}"
unzip -oq "${ARCHIVE_PATH}" -d "${STAGE_DIR}"

[ -d "${STAGE_DIR}/addons/counterstrikesharp" ] || die "Downloaded CounterStrikeSharp archive is missing addons/counterstrikesharp."
[ -f "${STAGE_DIR}/addons/counterstrikesharp/bin/linuxsteamrt64/counterstrikesharp.so" ] || die "Downloaded CounterStrikeSharp archive is missing the Linux plugin binary."
[ -f "${STAGE_DIR}/addons/metamod/counterstrikesharp.vdf" ] || die "Downloaded CounterStrikeSharp archive is missing the Metamod plugin registration file."

if [ "${CSS_EFFECTIVE_FLAVOR}" = "with-runtime" ] && [ ! -x "${STAGE_DIR}/addons/counterstrikesharp/dotnet/dotnet" ]; then
  die "Downloaded CounterStrikeSharp archive does not include the bundled .NET runtime."
fi

mkdir -p "${CSGO_ADDONS_DIR}"
overlay_directory_contents "${STAGE_DIR}/addons" "${CSGO_ADDONS_DIR}"

if ! counterstrikesharp_is_installed; then
  die "CounterStrikeSharp files were copied, but the Linux plugin binary is still missing after install."
fi

log "CounterStrikeSharp installation completed successfully."
log "Installed release: ${CSS_RESOLVED_TAG}"
log "Installed flavor: ${CSS_EFFECTIVE_FLAVOR}"
