#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
SERVER_JAR="${SERVER_JAR:-${DATA_DIR}/server.jar}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft}"
LOG_PREFIX="[mc]"

. /app/common.sh

META_FILE="$(gameserver_meta_file)"

MANIFEST_URL="https://launchermeta.mojang.com/mc/game/version_manifest.json"

mkdir -p "${DATA_DIR}" "${RUNTIME_DIR}"

log "Starting bootstrap..."

if [ "$#" -gt 0 ]; then
  log "Custom command requested, bypassing server bootstrap: $*"
  exec "$@"
fi

assert_writable_dir "${DATA_DIR}"
assert_writable_dir "${BACKUP_DIR}"

if [ "${EULA:-}" != "TRUE" ]; then
  die "You must accept the Minecraft EULA. Set environment variable: EULA=TRUE"
fi

echo "eula=true" > "${DATA_DIR}/eula.txt"

REQUESTED_VERSION="${MC_VERSION:-}"

if [ -z "${REQUESTED_VERSION}" ]; then
  die "MC_VERSION is required. The image does not default to latest in production mode."
fi

log "Requested version: ${REQUESTED_VERSION}"

LOCAL_VERSION=""
LOCAL_SERVER_TYPE=""
LOCAL_SERVER_SHA1=""
MANIFEST_JSON=""
RESOLVED_VERSION="${REQUESTED_VERSION}"

if [ -f "${META_FILE}" ]; then
  LOCAL_VERSION="$(metadata_value_from_file "${META_FILE}" '.minecraftVersion' || true)"
  LOCAL_SERVER_TYPE="$(metadata_value_from_file "${META_FILE}" '.serverType' || true)"
  LOCAL_SERVER_SHA1="$(metadata_value_from_file "${META_FILE}" '.artifact.checksum.sha1' || true)"
fi

download_server_artifact() {
  INSTALL_VERSION="$1"

  if [ -z "${MANIFEST_JSON}" ]; then
    MANIFEST_JSON="$(curl_to_stdout "${MANIFEST_URL}")"
  fi

  VERSION_METADATA_URL="$(printf '%s' "${MANIFEST_JSON}" \
    | jq -r --arg v "${INSTALL_VERSION}" '.versions[] | select(.id == $v) | .url' \
    | head -n1)"

  if [ -z "${VERSION_METADATA_URL}" ] || [ "${VERSION_METADATA_URL}" = "null" ]; then
    die "Version '${INSTALL_VERSION}' not found in manifest."
  fi

  VERSION_JSON="$(curl_to_stdout "${VERSION_METADATA_URL}")"

  SERVER_URL="$(printf '%s' "${VERSION_JSON}" | jq -r '.downloads.server.url // empty')"
  SERVER_SHA1="$(printf '%s' "${VERSION_JSON}" | jq -r '.downloads.server.sha1 // empty')"

  if [ -z "${SERVER_URL}" ]; then
    die "No server download URL available for version '${INSTALL_VERSION}'."
  fi

  log "Downloading Minecraft server ${INSTALL_VERSION}..."
  download_to_file "${SERVER_URL}" "${SERVER_JAR}" "${SERVER_SHA1}"
  write_gameserver_metadata "vanilla" "${INSTALL_VERSION}" "" "${SERVER_SHA1}" ""
}

if [ -z "${RESOLVED_VERSION}" ] || [ "${RESOLVED_VERSION}" = "null" ]; then
  die "Could not resolve Minecraft version."
fi

log "Resolved version: ${RESOLVED_VERSION}"

if [ -f "${SERVER_JAR}" ] && [ "${LOCAL_SERVER_TYPE}" = "vanilla" ] && [ "${LOCAL_VERSION}" = "${RESOLVED_VERSION}" ]; then
  log "Found existing server artifact for version ${RESOLVED_VERSION}, skipping download."
  write_gameserver_metadata "vanilla" "${RESOLVED_VERSION}" "" "${LOCAL_SERVER_SHA1}" ""
else
  if [ -f "${SERVER_JAR}" ] && [ -n "${LOCAL_SERVER_TYPE}" ] && [ "${LOCAL_SERVER_TYPE}" != "vanilla" ]; then
    log "Installed server type ${LOCAL_SERVER_TYPE} differs from requested type vanilla; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ] && [ -n "${LOCAL_VERSION}" ]; then
    log "Installed version ${LOCAL_VERSION} differs from requested version ${RESOLVED_VERSION}; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ]; then
    log "Found server artifact without version metadata; replacing it with version ${RESOLVED_VERSION}."
  elif [ -n "${LOCAL_VERSION}" ]; then
    log "Found version metadata for ${LOCAL_VERSION}, but no server artifact. Downloading version ${RESOLVED_VERSION}."
  else
    log "No local server artifact found. Downloading version ${RESOLVED_VERSION}."
  fi

  download_server_artifact "${RESOLVED_VERSION}"
fi

export DATA_DIR
export SERVER_JAR
export RUNTIME_DIR

log "Bootstrap complete, handing over to launcher..."
exec /app/launcher.sh
