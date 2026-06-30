#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
SERVER_JAR="${SERVER_JAR:-${DATA_DIR}/server.jar}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft}"
FABRIC_META_BASE="${FABRIC_META_BASE:-https://meta.fabricmc.net/v2}"
LOG_PREFIX="[mc-fabric]"

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

REQUESTED_VERSION="${MC_VERSION:-}"
REQUESTED_LOADER_VERSION="${FABRIC_LOADER_VERSION:-}"
REQUESTED_INSTALLER_VERSION="${FABRIC_INSTALLER_VERSION:-}"

if [ -z "${REQUESTED_VERSION}" ]; then
  die "MC_VERSION is required."
fi

if [ -z "${REQUESTED_LOADER_VERSION}" ]; then
  die "FABRIC_LOADER_VERSION is required."
fi

if [ -z "${REQUESTED_INSTALLER_VERSION}" ]; then
  die "FABRIC_INSTALLER_VERSION is required."
fi

log "Requested Minecraft version: ${REQUESTED_VERSION}"
log "Requested Fabric Loader version: ${REQUESTED_LOADER_VERSION}"
log "Requested Fabric Installer version: ${REQUESTED_INSTALLER_VERSION}"

LOCAL_VERSION=""
LOCAL_SERVER_TYPE=""
LOCAL_FABRIC_LOADER_VERSION=""
LOCAL_FABRIC_INSTALLER_VERSION=""

if [ -f "${META_FILE}" ]; then
  LOCAL_VERSION="$(metadata_value_from_file "${META_FILE}" '.minecraftVersion' || true)"
  LOCAL_SERVER_TYPE="$(metadata_value_from_file "${META_FILE}" '.serverType' || true)"
  LOCAL_FABRIC_LOADER_VERSION="$(metadata_value_from_file "${META_FILE}" '.fabricLoaderVersion' || true)"
  LOCAL_FABRIC_INSTALLER_VERSION="$(metadata_value_from_file "${META_FILE}" '.fabricInstallerVersion' || true)"
fi

download_fabric_artifact() {
  INSTALL_VERSION="$1"
  INSTALL_LOADER_VERSION="$2"
  INSTALL_INSTALLER_VERSION="$3"

  FABRIC_URL="${FABRIC_META_BASE}/versions/loader/${INSTALL_VERSION}/${INSTALL_LOADER_VERSION}/${INSTALL_INSTALLER_VERSION}/server/jar"

  log "Downloading Fabric Server Launcher for Minecraft ${INSTALL_VERSION}, loader ${INSTALL_LOADER_VERSION}, installer ${INSTALL_INSTALLER_VERSION}..."
  download_to_file "${FABRIC_URL}" "${SERVER_JAR}" "" ""
  write_gameserver_metadata "fabric" "${INSTALL_VERSION}" "" "" "" "${INSTALL_LOADER_VERSION}" "${INSTALL_INSTALLER_VERSION}"
}

if [ -f "${SERVER_JAR}" ] \
  && [ "${LOCAL_SERVER_TYPE}" = "fabric" ] \
  && [ "${LOCAL_VERSION}" = "${REQUESTED_VERSION}" ] \
  && [ "${LOCAL_FABRIC_LOADER_VERSION}" = "${REQUESTED_LOADER_VERSION}" ] \
  && [ "${LOCAL_FABRIC_INSTALLER_VERSION}" = "${REQUESTED_INSTALLER_VERSION}" ]; then
  log "Found existing Fabric artifact for Minecraft ${REQUESTED_VERSION}, loader ${REQUESTED_LOADER_VERSION}, installer ${REQUESTED_INSTALLER_VERSION}; skipping download."
  write_gameserver_metadata "fabric" "${REQUESTED_VERSION}" "" "" "" "${REQUESTED_LOADER_VERSION}" "${REQUESTED_INSTALLER_VERSION}"
else
  if [ -f "${SERVER_JAR}" ] && [ -n "${LOCAL_SERVER_TYPE}" ] && [ "${LOCAL_SERVER_TYPE}" != "fabric" ]; then
    log "Installed server type ${LOCAL_SERVER_TYPE} differs from requested type fabric; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ] && [ "${LOCAL_VERSION}" = "${REQUESTED_VERSION}" ] && [ -n "${LOCAL_FABRIC_LOADER_VERSION}" ] && [ "${LOCAL_FABRIC_LOADER_VERSION}" != "${REQUESTED_LOADER_VERSION}" ]; then
    log "Installed Fabric Loader ${LOCAL_FABRIC_LOADER_VERSION} differs from requested loader ${REQUESTED_LOADER_VERSION}; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ] && [ "${LOCAL_VERSION}" = "${REQUESTED_VERSION}" ] && [ -n "${LOCAL_FABRIC_INSTALLER_VERSION}" ] && [ "${LOCAL_FABRIC_INSTALLER_VERSION}" != "${REQUESTED_INSTALLER_VERSION}" ]; then
    log "Installed Fabric Installer ${LOCAL_FABRIC_INSTALLER_VERSION} differs from requested installer ${REQUESTED_INSTALLER_VERSION}; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ] && [ -n "${LOCAL_VERSION}" ]; then
    log "Installed Minecraft version ${LOCAL_VERSION} differs from requested version ${REQUESTED_VERSION}; replacing server artifact."
  elif [ -f "${SERVER_JAR}" ]; then
    log "Found server artifact without complete Fabric metadata; replacing it."
  else
    log "No local Fabric artifact found. Downloading requested launcher."
  fi

  download_fabric_artifact "${REQUESTED_VERSION}" "${REQUESTED_LOADER_VERSION}" "${REQUESTED_INSTALLER_VERSION}"
fi

export DATA_DIR
export SERVER_JAR
export RUNTIME_DIR

log "Bootstrap complete, handing over to launcher..."
exec /app/launcher.sh
