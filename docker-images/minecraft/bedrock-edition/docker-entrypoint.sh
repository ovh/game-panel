#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft-bedrock}"
BEDROCK_SERVER_BIN="${BEDROCK_SERVER_BIN:-${DATA_DIR}/bedrock_server}"
BEDROCK_DOWNLOAD_USER_AGENT="${BEDROCK_DOWNLOAD_USER_AGENT:-Mozilla/5.0}"
BEDROCK_DOWNLOAD_SHA256="${BEDROCK_DOWNLOAD_SHA256:-}"
LOG_PREFIX="[bedrock]"

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
assert_safe_data_dir

if [ "${EULA:-}" != "TRUE" ]; then
  die "You must accept the Minecraft EULA. Set environment variable: EULA=TRUE"
fi

REQUESTED_VERSION="${MC_VERSION:-}"
DOWNLOAD_URL="${BEDROCK_DOWNLOAD_URL:-}"

if [ -z "${REQUESTED_VERSION}" ]; then
  die "MC_VERSION is required."
fi

if [ -z "${DOWNLOAD_URL}" ]; then
  die "BEDROCK_DOWNLOAD_URL is required."
fi

export CURL_USER_AGENT="${BEDROCK_DOWNLOAD_USER_AGENT}"

log "Requested Bedrock version: ${REQUESTED_VERSION}"

LOCAL_SERVER_TYPE=""
LOCAL_MC_VERSION=""
LOCAL_DOWNLOAD_URL=""

if [ -f "${META_FILE}" ]; then
  LOCAL_SERVER_TYPE="$(metadata_value_from_file "${META_FILE}" '.serverType' || true)"
  LOCAL_MC_VERSION="$(metadata_value_from_file "${META_FILE}" '.bedrockVersion' || true)"
  LOCAL_DOWNLOAD_URL="$(metadata_value_from_file "${META_FILE}" '.artifact.sourceUrl' || true)"
fi

install_bedrock_root_entries() {
  SOURCE_DIR="$1"
  ROLLBACK_DIR="$2"
  INSTALLED_LIST="$3"

  mkdir -p "${ROLLBACK_DIR}"
  : > "${INSTALLED_LIST}"

  for ROOT_ENTRY in "${SOURCE_DIR}"/* "${SOURCE_DIR}"/.[!.]* "${SOURCE_DIR}"/..?*; do
    [ -e "${ROOT_ENTRY}" ] || continue

    ROOT_ENTRY_NAME="$(basename "${ROOT_ENTRY}")"
    log "Installing Bedrock root entry: ${ROOT_ENTRY_NAME}"

    printf '%s\n' "${ROOT_ENTRY_NAME}" >> "${INSTALLED_LIST}"

    if [ -e "${DATA_DIR}/${ROOT_ENTRY_NAME}" ] || [ -L "${DATA_DIR}/${ROOT_ENTRY_NAME}" ]; then
      mv "${DATA_DIR}/${ROOT_ENTRY_NAME}" "${ROLLBACK_DIR}/"
    fi

    if ! cp -a "${ROOT_ENTRY}" "${DATA_DIR}/"; then
      rollback_bedrock_root_entries "${ROLLBACK_DIR}" "${INSTALLED_LIST}"
      return 1
    fi
  done
}

rollback_bedrock_root_entries() {
  ROLLBACK_DIR="$1"
  INSTALLED_LIST="$2"

  log "Rolling back Bedrock server file installation..."

  while IFS= read -r ROOT_ENTRY_NAME; do
    [ -n "${ROOT_ENTRY_NAME}" ] || continue

    rm -rf "${DATA_DIR:?}/${ROOT_ENTRY_NAME}"

    if [ -e "${ROLLBACK_DIR}/${ROOT_ENTRY_NAME}" ] || [ -L "${ROLLBACK_DIR}/${ROOT_ENTRY_NAME}" ]; then
      mv "${ROLLBACK_DIR}/${ROOT_ENTRY_NAME}" "${DATA_DIR}/"
    fi
  done < "${INSTALLED_LIST}"
}

install_bedrock_artifact() {
  INSTALL_VERSION="$1"
  INSTALL_URL="$2"

  INSTALL_ROOT="$(mktemp -d "${RUNTIME_DIR}/bedrock-install.XXXXXX")"
  ZIP_PATH="${INSTALL_ROOT}/bedrock-server.zip"
  EXTRACT_DIR="${INSTALL_ROOT}/extract"
  ROLLBACK_DIR="${INSTALL_ROOT}/rollback"
  INSTALLED_LIST="${INSTALL_ROOT}/installed-root-entries"

  mkdir -p "${EXTRACT_DIR}" "${ROLLBACK_DIR}"

  log "Downloading Bedrock server ${INSTALL_VERSION}..."
  download_to_file "${INSTALL_URL}" "${ZIP_PATH}" "${BEDROCK_DOWNLOAD_SHA256}" "sha256"

  log "Extracting Bedrock server archive..."
  unzip -q "${ZIP_PATH}" -d "${EXTRACT_DIR}"

  if [ ! -f "${EXTRACT_DIR}/bedrock_server" ]; then
    rm -rf "${INSTALL_ROOT}"
    die "Downloaded archive does not contain a Linux bedrock_server binary."
  fi

  log "Installing Bedrock server files..."
  install_bedrock_root_entries "${EXTRACT_DIR}" "${ROLLBACK_DIR}" "${INSTALLED_LIST}"

  chmod +x "${BEDROCK_SERVER_BIN}"

  write_bedrock_metadata "${INSTALL_VERSION}" "${INSTALL_URL}" "${BEDROCK_DOWNLOAD_SHA256}"
  rm -rf "${INSTALL_ROOT}"
}

if [ -x "${BEDROCK_SERVER_BIN}" ] \
  && [ "${LOCAL_SERVER_TYPE}" = "bedrock" ] \
  && [ "${LOCAL_MC_VERSION}" = "${REQUESTED_VERSION}" ] \
  && [ "${LOCAL_DOWNLOAD_URL}" = "${DOWNLOAD_URL}" ]; then
  log "Found existing Bedrock installation for version ${REQUESTED_VERSION}; skipping install."
else
  if [ -x "${BEDROCK_SERVER_BIN}" ] && [ -n "${LOCAL_SERVER_TYPE}" ] && [ "${LOCAL_SERVER_TYPE}" != "bedrock" ]; then
    log "Installed server type ${LOCAL_SERVER_TYPE} differs from requested type bedrock; replacing server files."
  elif [ -x "${BEDROCK_SERVER_BIN}" ] && [ -n "${LOCAL_MC_VERSION}" ] && [ "${LOCAL_MC_VERSION}" != "${REQUESTED_VERSION}" ]; then
    log "Installed Bedrock version ${LOCAL_MC_VERSION} differs from requested version ${REQUESTED_VERSION}; replacing server files."
  elif [ -x "${BEDROCK_SERVER_BIN}" ] && [ -n "${LOCAL_DOWNLOAD_URL}" ] && [ "${LOCAL_DOWNLOAD_URL}" != "${DOWNLOAD_URL}" ]; then
    log "Bedrock download URL changed for version ${REQUESTED_VERSION}; replacing server files."
  elif [ -f "${BEDROCK_SERVER_BIN}" ]; then
    log "Found Bedrock binary without complete metadata; replacing server files."
  else
    log "No local Bedrock installation found. Installing requested version."
  fi

  install_bedrock_artifact "${REQUESTED_VERSION}" "${DOWNLOAD_URL}"
fi

export DATA_DIR
export RUNTIME_DIR
export BEDROCK_SERVER_BIN

log "Bootstrap complete, handing over to launcher..."
exec /app/launcher.sh
