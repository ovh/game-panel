#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
SERVER_JAR="${SERVER_JAR:-${DATA_DIR}/server.jar}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft}"
NEOFORGE_MAVEN_BASE="${NEOFORGE_MAVEN_BASE:-https://maven.neoforged.net/releases}"
SERVER_STARTER_JAR_URL="${SERVER_STARTER_JAR_URL:-https://github.com/neoforged/ServerStarterJar/releases/latest/download/server.jar}"
SERVER_STARTER_JAR_SHA256="${SERVER_STARTER_JAR_SHA256:-}"
LOG_PREFIX="[mc-neoforge]"

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

echo "eula=true" > "${DATA_DIR}/eula.txt"

REQUESTED_NEOFORGE_VERSION="${NEOFORGE_VERSION:-}"

if [ -z "${REQUESTED_NEOFORGE_VERSION}" ]; then
  die "NEOFORGE_VERSION is required."
fi

log "Requested NeoForge version: ${REQUESTED_NEOFORGE_VERSION}"

LOCAL_SERVER_TYPE=""
LOCAL_NEOFORGE_VERSION=""
LOCAL_SERVER_STARTER_JAR_URL=""

if [ -f "${META_FILE}" ]; then
  LOCAL_SERVER_TYPE="$(metadata_value_from_file "${META_FILE}" '.serverType' || true)"
  LOCAL_NEOFORGE_VERSION="$(metadata_value_from_file "${META_FILE}" '.neoForgeVersion' || true)"
  LOCAL_SERVER_STARTER_JAR_URL="$(metadata_value_from_file "${META_FILE}" '.serverStarterJarUrl' || true)"
fi

install_neoforge_artifact() {
  INSTALL_VERSION="$1"

  INSTALLER_NAME="neoforge-${INSTALL_VERSION}-installer.jar"
  INSTALLER_URL="${NEOFORGE_MAVEN_BASE}/net/neoforged/neoforge/${INSTALL_VERSION}/${INSTALLER_NAME}"
  INSTALLER_SHA256_URL="${INSTALLER_URL}.sha256"
  INSTALLER_PATH="${RUNTIME_DIR}/${INSTALLER_NAME}"

  log "Downloading NeoForge installer ${INSTALL_VERSION}..."
  INSTALLER_SHA256="$(curl_to_stdout "${INSTALLER_SHA256_URL}" | awk '{print $1}')"

  if [ -z "${INSTALLER_SHA256}" ]; then
    die "No SHA256 checksum available for NeoForge installer ${INSTALL_VERSION}."
  fi

  download_to_file "${INSTALLER_URL}" "${INSTALLER_PATH}" "${INSTALLER_SHA256}" "sha256"

  log "Running NeoForge installer ${INSTALL_VERSION}..."
  (
    cd "${DATA_DIR}"
    java -jar "${INSTALLER_PATH}" --installServer
  )

  if [ ! -f "${DATA_DIR}/run.sh" ]; then
    die "NeoForge installer completed, but run.sh was not created."
  fi

  log "Downloading NeoForged ServerStarterJar..."
  download_to_file "${SERVER_STARTER_JAR_URL}" "${SERVER_JAR}" "${SERVER_STARTER_JAR_SHA256}" "sha256"

  write_gameserver_metadata "neoforge" "" "" "" "${SERVER_STARTER_JAR_SHA256}" "" "" "${INSTALL_VERSION}" "${SERVER_STARTER_JAR_URL}" "${INSTALLER_SHA256}"
}

if [ -f "${SERVER_JAR}" ] \
  && [ -f "${DATA_DIR}/run.sh" ] \
  && [ "${LOCAL_SERVER_TYPE}" = "neoforge" ] \
  && [ "${LOCAL_NEOFORGE_VERSION}" = "${REQUESTED_NEOFORGE_VERSION}" ] \
  && [ "${LOCAL_SERVER_STARTER_JAR_URL}" = "${SERVER_STARTER_JAR_URL}" ]; then
  log "Found existing NeoForge installation ${REQUESTED_NEOFORGE_VERSION}; skipping install."
else
  if [ -f "${SERVER_JAR}" ] && [ -n "${LOCAL_SERVER_TYPE}" ] && [ "${LOCAL_SERVER_TYPE}" != "neoforge" ]; then
    log "Installed server type ${LOCAL_SERVER_TYPE} differs from requested type neoforge; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ] && [ -n "${LOCAL_NEOFORGE_VERSION}" ] && [ "${LOCAL_NEOFORGE_VERSION}" != "${REQUESTED_NEOFORGE_VERSION}" ]; then
    log "Installed NeoForge ${LOCAL_NEOFORGE_VERSION} differs from requested NeoForge ${REQUESTED_NEOFORGE_VERSION}; reinstalling."
  elif [ -f "${SERVER_JAR}" ] && [ ! -f "${DATA_DIR}/run.sh" ]; then
    log "Found server artifact without NeoForge run scripts; reinstalling."
  elif [ -f "${SERVER_JAR}" ] && [ "${LOCAL_SERVER_STARTER_JAR_URL}" != "${SERVER_STARTER_JAR_URL}" ]; then
    log "ServerStarterJar source changed; reinstalling wrapper."
  elif [ -f "${SERVER_JAR}" ]; then
    log "Found server artifact without complete NeoForge metadata; reinstalling."
  else
    log "No local NeoForge installation found. Installing requested version."
  fi

  install_neoforge_artifact "${REQUESTED_NEOFORGE_VERSION}"
fi

export DATA_DIR
export SERVER_JAR
export RUNTIME_DIR

log "Bootstrap complete, handing over to launcher..."
exec /app/launcher.sh
