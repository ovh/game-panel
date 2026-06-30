#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft-bedrock}"
BEDROCK_SERVER_BIN="${BEDROCK_SERVER_BIN:-${DATA_DIR}/bedrock_server}"
SERVER_ARTIFACT="${SERVER_ARTIFACT:-${BEDROCK_SERVER_BIN}}"
RESTORE_ARCHIVE="${RESTORE_ARCHIVE:-${1:-}}"
RESTORE_LOCK_DIR="${RESTORE_LOCK_DIR:-${BACKUP_DIR}/.restore.lock}"
RESTORE_PRESERVE_SERVER_ARTIFACT_IF_VERSION_MATCH="${RESTORE_PRESERVE_SERVER_ARTIFACT_IF_VERSION_MATCH:-true}"
EXPECTED_SERVER_TYPE="${GAMESERVER_SERVER_TYPE:-bedrock}"
LOG_PREFIX="[bedrock-restore]"

. /app/common.sh

META_RELATIVE="$(metadata_file_relative_to_data || true)"

LOCK_ACQUIRED="false"
RESTORE_SUCCESS="false"
DATA_MOVED="false"
SERVER_ARTIFACT_STASH_DIR=""
SERVER_ARTIFACT_STASH_PATH=""
SERVER_ARTIFACT_STASH_MODE=""
ARCHIVE_PATH=""
ARCHIVE_META_JSON=""
RESTORE_WORK_DIR=""
RESTORE_WORK_NAME=""
RESTORE_NEW_DIR=""
RESTORE_OLD_DIR=""

move_dir_contents() {
  SOURCE_DIR="$1"
  TARGET_DIR="$2"

  find "${SOURCE_DIR}" -mindepth 1 -maxdepth 1 -exec mv -- {} "${TARGET_DIR}/" \;
}

clear_data_dir_except_restore_work() {
  if [ -n "${RESTORE_WORK_NAME}" ]; then
    find "${DATA_DIR}" -mindepth 1 -maxdepth 1 ! -name "${RESTORE_WORK_NAME}" -exec rm -rf -- {} +
  else
    find "${DATA_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  fi
}

rollback_restore() {
  if [ "${DATA_MOVED}" = "true" ] && [ -d "${RESTORE_OLD_DIR}" ]; then
    log "Restore failed before completion, rolling back previous data..."
    clear_data_dir_except_restore_work
    move_dir_contents "${RESTORE_OLD_DIR}" "${DATA_DIR}"
    DATA_MOVED="false"
  fi
}

cleanup() {
  if [ "${RESTORE_SUCCESS}" != "true" ]; then
    rollback_restore || true

    if [ -n "${SERVER_ARTIFACT_STASH_PATH}" ] && [ -f "${SERVER_ARTIFACT_STASH_PATH}" ]; then
      log "Restore failed before completion, restoring preserved server artifact..."
      mkdir -p "$(dirname "${SERVER_ARTIFACT}")"
      mv "${SERVER_ARTIFACT_STASH_PATH}" "${SERVER_ARTIFACT}" 2>/dev/null || true
    fi
  fi

  if [ -n "${RESTORE_WORK_DIR}" ] && [ -d "${RESTORE_WORK_DIR}" ]; then
    rm -rf "${RESTORE_WORK_DIR}" 2>/dev/null || true
  fi

  if [ -n "${SERVER_ARTIFACT_STASH_DIR}" ] && [ -d "${SERVER_ARTIFACT_STASH_DIR}" ]; then
    rm -rf "${SERVER_ARTIFACT_STASH_DIR}" 2>/dev/null || true
  fi

  if [ "${LOCK_ACQUIRED}" = "true" ]; then
    rmdir "${RESTORE_LOCK_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

resolve_archive_path() {
  INPUT="$1"

  if [ -z "${INPUT}" ]; then
    echo "[bedrock-restore] Usage: /app/restore.sh <archive-name-or-path>" >&2
    echo "[bedrock-restore] Or set RESTORE_ARCHIVE=/backups/<archive>.tar.gz" >&2
    exit 1
  fi

  case "${INPUT}" in
    /*|./*|../*|*/*)
      CANDIDATE="${INPUT}"
      ;;
    *)
      CANDIDATE="${BACKUP_DIR}/${INPUT}"
      ;;
  esac

  if [ ! -f "${CANDIDATE}" ]; then
    die "Backup archive not found: ${CANDIDATE}"
  fi

  printf '%s\n' "${CANDIDATE}"
}

archive_contains_file() {
  TARGET="$1"

  [ -n "${TARGET}" ] || return 1

  tar -tzf "${ARCHIVE_PATH}" 2>/dev/null | grep -Fx -e "./${TARGET}" -e "${TARGET}" >/dev/null
}

read_archive_file() {
  TARGET="$1"

  tar -xOzf "${ARCHIVE_PATH}" "./${TARGET}" 2>/dev/null || tar -xOzf "${ARCHIVE_PATH}" "${TARGET}" 2>/dev/null || true
}

validate_archive_members() {
  ARCHIVE_LIST_FILE="$(mktemp "${RUNTIME_DIR}/restore-archive-list.XXXXXX")"

  if ! tar -tzf "${ARCHIVE_PATH}" > "${ARCHIVE_LIST_FILE}" 2>/dev/null; then
    rm -f "${ARCHIVE_LIST_FILE}"
    die "Archive is not a readable gzip tarball: ${ARCHIVE_PATH}"
  fi

  while IFS= read -r ARCHIVE_ENTRY; do
    case "${ARCHIVE_ENTRY}" in
      "./"|".")
        continue
        ;;
    esac

    NORMALIZED_ENTRY="${ARCHIVE_ENTRY#./}"

    case "${NORMALIZED_ENTRY}" in
      "."|".."|/*|../*|*/../*|*/..|.restore-work|.restore-work/*|.restore-work.*|.restore-work.*/*)
        rm -f "${ARCHIVE_LIST_FILE}"
        die "Archive contains an unsafe path: ${ARCHIVE_ENTRY}"
        ;;
    esac
  done < "${ARCHIVE_LIST_FILE}"

  rm -f "${ARCHIVE_LIST_FILE}"

  if ! tar -tzvf "${ARCHIVE_PATH}" 2>/dev/null | awk '
    substr($1, 1, 1) == "l" || substr($1, 1, 1) == "h" { exit 1 }
  '; then
    die "Archive contains links, which are not supported by restore."
  fi
}

validate_archive_metadata() {
  if [ -z "${META_RELATIVE}" ]; then
    die "GAMESERVER_META_FILE must be inside DATA_DIR for restore validation."
  fi

  if ! archive_contains_file "${META_RELATIVE}"; then
    die "Backup archive does not contain required metadata file: ${META_RELATIVE}"
  fi

  ARCHIVE_META_JSON="$(read_archive_file "${META_RELATIVE}")"

  if [ -z "${ARCHIVE_META_JSON}" ]; then
    die "Backup metadata is empty or unreadable: ${META_RELATIVE}"
  fi

  if ARCHIVE_SERVER_TYPE="$(printf '%s' "${ARCHIVE_META_JSON}" | jq -er '
    def non_empty_string: type == "string" and length > 0;

    select(type == "object")
    | select(.schemaVersion == 1)
    | select(.serverType == "bedrock")
    | select(.bedrockVersion | non_empty_string)
    | .serverType
  ' 2>/dev/null)"; then
    :
  else
    die "Backup metadata is invalid or unsupported: ${META_RELATIVE}"
  fi

  if [ "${ARCHIVE_SERVER_TYPE}" != "${EXPECTED_SERVER_TYPE}" ]; then
    die "Backup server type '${ARCHIVE_SERVER_TYPE}' cannot be restored by '${EXPECTED_SERVER_TYPE}' image."
  fi
}

stash_server_artifact() {
  MODE="$1"

  [ -f "${SERVER_ARTIFACT}" ] || return 0

  mkdir -p "${RUNTIME_DIR}"
  SERVER_ARTIFACT_STASH_DIR="$(mktemp -d "${RUNTIME_DIR}/restore-server-artifact.XXXXXX")"
  SERVER_ARTIFACT_STASH_PATH="${SERVER_ARTIFACT_STASH_DIR}/$(basename "${SERVER_ARTIFACT}")"
  SERVER_ARTIFACT_STASH_MODE="${MODE}"

  mv "${SERVER_ARTIFACT}" "${SERVER_ARTIFACT_STASH_PATH}"
}

restore_stashed_server_artifact() {
  if [ -n "${SERVER_ARTIFACT_STASH_PATH}" ] && [ -f "${SERVER_ARTIFACT_STASH_PATH}" ]; then
    mkdir -p "$(dirname "${SERVER_ARTIFACT}")"
    mv "${SERVER_ARTIFACT_STASH_PATH}" "${SERVER_ARTIFACT}"
  fi
}

prepare_restore_work_dir() {
  RESTORE_WORK_DIR="$(mktemp -d "${DATA_DIR}/.restore-work.XXXXXX")"
  RESTORE_WORK_NAME="$(basename "${RESTORE_WORK_DIR}")"
  RESTORE_NEW_DIR="${RESTORE_WORK_DIR}/new"
  RESTORE_OLD_DIR="${RESTORE_WORK_DIR}/old"

  mkdir -p "${RESTORE_NEW_DIR}" "${RESTORE_OLD_DIR}"
}

move_current_data_aside() {
  DATA_MOVED="true"

  if ! find "${DATA_DIR}" -mindepth 1 -maxdepth 1 ! -name "${RESTORE_WORK_NAME}" -exec mv -- {} "${RESTORE_OLD_DIR}/" \;; then
    log "Failed to move current data aside, restoring entries already moved..."
    move_dir_contents "${RESTORE_OLD_DIR}" "${DATA_DIR}" || true
    DATA_MOVED="false"
    die "Could not move current data into restore staging area."
  fi
}

restore_extracted_data() {
  move_dir_contents "${RESTORE_NEW_DIR}" "${DATA_DIR}"
}

assert_safe_data_dir
assert_writable_dir "${DATA_DIR}"
assert_writable_dir "${BACKUP_DIR}"
mkdir -p "${RUNTIME_DIR}"

if ! mkdir "${RESTORE_LOCK_DIR}" 2>/dev/null; then
  die "Another restore is already running."
fi
LOCK_ACQUIRED="true"

ARCHIVE_PATH="$(resolve_archive_path "${RESTORE_ARCHIVE}")"

log "Starting restore..."
log "Archive: ${ARCHIVE_PATH}"

validate_archive_members
validate_archive_metadata

ARCHIVE_VERSION="$(metadata_value_from_json "${ARCHIVE_META_JSON}" '.bedrockVersion' || true)"
ARCHIVE_IDENTITY="$(metadata_identity_from_json "${ARCHIVE_META_JSON}" || true)"

LOCAL_VERSION=""
LOCAL_SERVER_TYPE=""
LOCAL_IDENTITY=""

META_FILE="$(gameserver_meta_file)"
if [ -f "${META_FILE}" ]; then
  LOCAL_VERSION="$(metadata_value_from_file "${META_FILE}" '.bedrockVersion' || true)"
  LOCAL_SERVER_TYPE="$(metadata_value_from_file "${META_FILE}" '.serverType' || true)"
  LOCAL_IDENTITY="$(metadata_identity_from_file "${META_FILE}" || true)"
fi

SERVER_ARTIFACT_RELATIVE=""
SERVER_ARTIFACT_UNDER_DATA="false"

case "${SERVER_ARTIFACT}" in
  "${DATA_DIR}"/*)
    SERVER_ARTIFACT_RELATIVE="${SERVER_ARTIFACT#${DATA_DIR}/}"
    SERVER_ARTIFACT_UNDER_DATA="true"
    ;;
esac

ARCHIVE_HAS_SERVER_ARTIFACT="false"
if archive_contains_file "${SERVER_ARTIFACT_RELATIVE}"; then
  ARCHIVE_HAS_SERVER_ARTIFACT="true"
fi

log "Archive server type: ${ARCHIVE_SERVER_TYPE}"
log "Archive Bedrock version: ${ARCHIVE_VERSION}"
log "Current local server type: ${LOCAL_SERVER_TYPE:-unknown}"
log "Current local Bedrock version: ${LOCAL_VERSION:-unknown}"

if [ "${ARCHIVE_HAS_SERVER_ARTIFACT}" = "true" ]; then
  log "Archive contains a server artifact at ${SERVER_ARTIFACT_RELATIVE}."
elif [ -n "${SERVER_ARTIFACT_RELATIVE}" ]; then
  log "Archive does not contain a server artifact at ${SERVER_ARTIFACT_RELATIVE}."
else
  log "SERVER_ARTIFACT is outside ${DATA_DIR}; the archive cannot provide it directly."
fi

if is_truthy "${RESTORE_PRESERVE_SERVER_ARTIFACT_IF_VERSION_MATCH}" \
  && [ "${ARCHIVE_HAS_SERVER_ARTIFACT}" != "true" ] \
  && [ -f "${SERVER_ARTIFACT}" ] \
  && [ -n "${LOCAL_IDENTITY}" ] \
  && [ -n "${ARCHIVE_IDENTITY}" ] \
  && [ "${LOCAL_IDENTITY}" = "${ARCHIVE_IDENTITY}" ]; then
  if [ "${SERVER_ARTIFACT_UNDER_DATA}" = "true" ]; then
    log "Preserving current server artifact because the backup metadata matches the installed metadata."
    stash_server_artifact "restore-after-extract"
  else
    log "Reusing external server artifact because the backup metadata matches the installed metadata."
  fi
elif [ "${SERVER_ARTIFACT_UNDER_DATA}" != "true" ] && [ -f "${SERVER_ARTIFACT}" ]; then
  log "Moving external server artifact out of the way so the next start can download the restored version if needed."
  stash_server_artifact "restore-on-failure-only"
fi

prepare_restore_work_dir

log "Extracting backup archive into staging directory..."
tar --no-same-owner -xzf "${ARCHIVE_PATH}" -C "${RESTORE_NEW_DIR}"

log "Moving current data aside..."
move_current_data_aside

log "Installing restored data..."
restore_extracted_data

if [ "${SERVER_ARTIFACT_STASH_MODE}" = "restore-after-extract" ]; then
  log "Restoring preserved server artifact..."
  restore_stashed_server_artifact
fi

if [ -f "${SERVER_ARTIFACT}" ]; then
  chmod +x "${SERVER_ARTIFACT}"
fi

RESTORE_SUCCESS="true"

if [ -f "${SERVER_ARTIFACT}" ]; then
  log "Local server artifact is present after restore."
elif [ -n "${ARCHIVE_VERSION}" ]; then
  log "Restore completed without a local server artifact."
  log "The next container start will download the Bedrock server artifact for ${ARCHIVE_VERSION}."
else
  log "Restore completed without a local server artifact or version metadata."
  log "The next container start will require MC_VERSION and BEDROCK_DOWNLOAD_URL to download the server artifact."
fi

log "Restore completed successfully."
