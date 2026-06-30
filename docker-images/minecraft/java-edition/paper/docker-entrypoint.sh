#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
SERVER_JAR="${SERVER_JAR:-${DATA_DIR}/server.jar}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft}"
PAPERMC_API_BASE="${PAPERMC_API_BASE:-https://fill.papermc.io/v3}"
PAPERMC_PROJECT="${PAPERMC_PROJECT:-paper}"
PAPERMC_USER_AGENT="${PAPERMC_USER_AGENT:-}"
LOG_PREFIX="[mc-paper]"

. /app/common.sh

META_FILE="$(gameserver_meta_file)"

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

if [ -z "${PAPERMC_USER_AGENT}" ]; then
  die "PAPERMC_USER_AGENT is required for PaperMC downloads, for example: your-panel/1.0 ([email protected])"
fi

export CURL_USER_AGENT="${PAPERMC_USER_AGENT}"

echo "eula=true" > "${DATA_DIR}/eula.txt"

REQUESTED_VERSION="${MC_VERSION:-}"
REQUESTED_BUILD="${PAPER_BUILD:-}"

if [ -z "${REQUESTED_VERSION}" ]; then
  die "MC_VERSION is required."
fi

case "${REQUESTED_BUILD}" in
  ""|*[!0-9]*)
    die "PAPER_BUILD is required."
    ;;
esac

log "Requested Minecraft version: ${REQUESTED_VERSION}"
log "Requested Paper build: ${REQUESTED_BUILD}"

LOCAL_VERSION=""
LOCAL_SERVER_TYPE=""
LOCAL_PAPER_BUILD=""
LOCAL_PAPER_SHA256=""

if [ -f "${META_FILE}" ]; then
  LOCAL_VERSION="$(metadata_value_from_file "${META_FILE}" '.minecraftVersion' || true)"
  LOCAL_SERVER_TYPE="$(metadata_value_from_file "${META_FILE}" '.serverType' || true)"
  LOCAL_PAPER_BUILD="$(metadata_value_from_file "${META_FILE}" '.paperBuild' || true)"
  LOCAL_PAPER_SHA256="$(metadata_value_from_file "${META_FILE}" '.artifact.checksum.sha256' || true)"
fi

download_paper_artifact() {
  INSTALL_VERSION="$1"
  INSTALL_BUILD="$2"

  BUILDS_URL="${PAPERMC_API_BASE}/projects/${PAPERMC_PROJECT}/versions/${INSTALL_VERSION}/builds"
  BUILDS_JSON="$(curl_to_stdout "${BUILDS_URL}")"

  if printf '%s' "${BUILDS_JSON}" | jq -e '.ok == false' >/dev/null 2>&1; then
    PAPER_ERROR="$(printf '%s' "${BUILDS_JSON}" | jq -r '.message // "Unknown PaperMC API error"')"
    die "PaperMC API error: ${PAPER_ERROR}"
  fi

  BUILD_JSON="$(printf '%s' "${BUILDS_JSON}" \
    | jq -c --arg build "${INSTALL_BUILD}" 'first(.[] | select((.id | tostring) == $build)) // empty')"

  if [ -z "${BUILD_JSON}" ] || [ "${BUILD_JSON}" = "null" ]; then
    die "Paper build '${INSTALL_BUILD}' not found for Minecraft version '${INSTALL_VERSION}'."
  fi

  PAPER_URL="$(printf '%s' "${BUILD_JSON}" | jq -r '.downloads."server:default".url // empty')"
  PAPER_SHA256="$(printf '%s' "${BUILD_JSON}" | jq -r '.downloads."server:default".checksums.sha256 // empty')"

  if [ -z "${PAPER_URL}" ]; then
    die "No Paper server download URL available for Minecraft '${INSTALL_VERSION}' build '${INSTALL_BUILD}'."
  fi

  if [ -z "${PAPER_SHA256}" ]; then
    die "No Paper SHA256 checksum available for Minecraft '${INSTALL_VERSION}' build '${INSTALL_BUILD}'."
  fi

  log "Downloading Paper ${INSTALL_VERSION} build ${INSTALL_BUILD}..."
  download_to_file "${PAPER_URL}" "${SERVER_JAR}" "${PAPER_SHA256}" "sha256"
  write_gameserver_metadata "paper" "${INSTALL_VERSION}" "${INSTALL_BUILD}" "" "${PAPER_SHA256}"
}

if [ -f "${SERVER_JAR}" ] \
  && [ "${LOCAL_SERVER_TYPE}" = "paper" ] \
  && [ "${LOCAL_VERSION}" = "${REQUESTED_VERSION}" ] \
  && [ "${LOCAL_PAPER_BUILD}" = "${REQUESTED_BUILD}" ]; then
  log "Found existing Paper artifact for Minecraft ${REQUESTED_VERSION} build ${REQUESTED_BUILD}, skipping download."
  write_gameserver_metadata "paper" "${REQUESTED_VERSION}" "${REQUESTED_BUILD}" "" "${LOCAL_PAPER_SHA256}"
else
  if [ -f "${SERVER_JAR}" ] && [ -n "${LOCAL_SERVER_TYPE}" ] && [ "${LOCAL_SERVER_TYPE}" != "paper" ]; then
    log "Installed server type ${LOCAL_SERVER_TYPE} differs from requested type paper; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ] && [ "${LOCAL_VERSION}" = "${REQUESTED_VERSION}" ] && [ -n "${LOCAL_PAPER_BUILD}" ]; then
    log "Installed Paper build ${LOCAL_PAPER_BUILD} differs from requested build ${REQUESTED_BUILD}; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ] && [ -n "${LOCAL_VERSION}" ]; then
    log "Installed Minecraft version ${LOCAL_VERSION} differs from requested version ${REQUESTED_VERSION}; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ]; then
    log "Found server artifact without complete Paper metadata; replacing it."
  else
    log "No local Paper artifact found. Downloading requested build."
  fi

  download_paper_artifact "${REQUESTED_VERSION}" "${REQUESTED_BUILD}"
fi

export DATA_DIR
export SERVER_JAR
export RUNTIME_DIR

log "Bootstrap complete, handing over to launcher..."
exec /app/launcher.sh
