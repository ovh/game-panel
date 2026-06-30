#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
HYTALE_GAME_DIR="${HYTALE_GAME_DIR:-${DATA_DIR}/game}"
HYTALE_SERVER_DIR="${HYTALE_SERVER_DIR:-${HYTALE_GAME_DIR}/Server}"
HYTALE_UNIVERSE_DIR="${HYTALE_UNIVERSE_DIR:-${HYTALE_SERVER_DIR}/universe}"
HYTALE_BACKUP_DIR="${HYTALE_BACKUP_DIR:-${HYTALE_SERVER_DIR}/backups}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/hytale}"
RESTORE_ARCHIVE="${RESTORE_ARCHIVE:-${1:-}}"
RESTORE_LOCK_DIR="${RESTORE_LOCK_DIR:-${HYTALE_SERVER_DIR}/.restore.lock}"
LOG_PREFIX="[hytale-restore]"

. /app/common.sh

LOCK_ACQUIRED="false"
RESTORE_SUCCESS="false"
UNIVERSE_MOVED="false"
ARCHIVE_PATH=""
RESTORE_WORK_DIR=""
RESTORE_EXTRACT_DIR=""
RESTORE_NEW_UNIVERSE_DIR=""
RESTORE_OLD_UNIVERSE_DIR=""

cleanup() {
  if [ "${RESTORE_SUCCESS}" != "true" ] && [ "${UNIVERSE_MOVED}" = "true" ] && [ -d "${RESTORE_OLD_UNIVERSE_DIR}" ]; then
    log "Restore failed before completion, rolling back previous universe..."
    rm -rf "${HYTALE_UNIVERSE_DIR}" 2>/dev/null || true
    mv "${RESTORE_OLD_UNIVERSE_DIR}" "${HYTALE_UNIVERSE_DIR}" 2>/dev/null || true
  fi

  if [ -n "${RESTORE_WORK_DIR}" ] && [ -d "${RESTORE_WORK_DIR}" ]; then
    rm -rf "${RESTORE_WORK_DIR}" 2>/dev/null || true
  fi

  if [ "${LOCK_ACQUIRED}" = "true" ]; then
    rmdir "${RESTORE_LOCK_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

usage() {
  echo "Usage: /app/restore.sh <hytale-native-backup-name-or-path>" >&2
  echo "Or set RESTORE_ARCHIVE=/data/game/Server/backups/<backup>.zip" >&2
}

resolve_archive_path() {
  INPUT="$1"

  if [ -z "${INPUT}" ]; then
    usage
    exit 1
  fi

  case "${INPUT}" in
    /*|./*|../*|*/*)
      CANDIDATE="${INPUT}"
      ;;
    *)
      CANDIDATE="${HYTALE_BACKUP_DIR}/${INPUT}"
      ;;
  esac

  if [ ! -f "${CANDIDATE}" ]; then
    die "Backup archive not found: ${CANDIDATE}"
  fi

  printf '%s\n' "${CANDIDATE}"
}

validate_archive_members() {
  ARCHIVE_LIST_FILE="$(mktemp "${RUNTIME_DIR}/hytale-restore-list.XXXXXX")"

  if ! unzip -Z1 "${ARCHIVE_PATH}" > "${ARCHIVE_LIST_FILE}" 2>/dev/null; then
    rm -f "${ARCHIVE_LIST_FILE}"
    die "Archive is not a readable zip file: ${ARCHIVE_PATH}"
  fi

  while IFS= read -r ARCHIVE_ENTRY; do
    [ -n "${ARCHIVE_ENTRY}" ] || continue

    case "${ARCHIVE_ENTRY}" in
      /*|../*|*/../*|*/..|.|..)
        rm -f "${ARCHIVE_LIST_FILE}"
        die "Archive contains an unsafe path: ${ARCHIVE_ENTRY}"
        ;;
    esac
  done < "${ARCHIVE_LIST_FILE}"

  rm -f "${ARCHIVE_LIST_FILE}"
}

validate_extracted_universe() {
  if find "${RESTORE_EXTRACT_DIR}" -type l | grep . >/dev/null 2>&1; then
    die "Backup archive contains symbolic links, which are not supported by restore."
  fi

  if ! find "${RESTORE_NEW_UNIVERSE_DIR}" -mindepth 1 -print -quit | grep . >/dev/null 2>&1; then
    die "Backup archive did not contain any restorable universe data."
  fi
}

prepare_restore_work_dir() {
  RESTORE_WORK_DIR="$(mktemp -d "${HYTALE_SERVER_DIR}/.restore-work.XXXXXX")"
  RESTORE_EXTRACT_DIR="${RESTORE_WORK_DIR}/extract"
  RESTORE_NEW_UNIVERSE_DIR="${RESTORE_WORK_DIR}/new-universe"
  RESTORE_OLD_UNIVERSE_DIR="${RESTORE_WORK_DIR}/old-universe"

  mkdir -p "${RESTORE_EXTRACT_DIR}" "${RESTORE_NEW_UNIVERSE_DIR}"
}

extract_archive() {
  unzip -q "${ARCHIVE_PATH}" -d "${RESTORE_EXTRACT_DIR}"
  find "${RESTORE_EXTRACT_DIR}" -mindepth 1 -maxdepth 1 -exec mv -- {} "${RESTORE_NEW_UNIVERSE_DIR}/" \;
}

install_universe() {
  if [ -e "${HYTALE_UNIVERSE_DIR}" ]; then
    mv "${HYTALE_UNIVERSE_DIR}" "${RESTORE_OLD_UNIVERSE_DIR}"
    UNIVERSE_MOVED="true"
  fi

  mkdir -p "$(dirname "${HYTALE_UNIVERSE_DIR}")"
  mv "${RESTORE_NEW_UNIVERSE_DIR}" "${HYTALE_UNIVERSE_DIR}"
  RESTORE_SUCCESS="true"

  if [ "${UNIVERSE_MOVED}" = "true" ] && [ -d "${RESTORE_OLD_UNIVERSE_DIR}" ]; then
    rm -rf "${RESTORE_OLD_UNIVERSE_DIR}"
  fi
}

assert_safe_data_dir
assert_writable_dir "${DATA_DIR}"
assert_writable_dir "${HYTALE_SERVER_DIR}"
mkdir -p "${RUNTIME_DIR}" "${HYTALE_BACKUP_DIR}"

assert_hytale_server_stopped

if ! mkdir "${RESTORE_LOCK_DIR}" 2>/dev/null; then
  die "Another Hytale restore operation appears to be running: ${RESTORE_LOCK_DIR}"
fi
LOCK_ACQUIRED="true"

ARCHIVE_PATH="$(resolve_archive_path "${RESTORE_ARCHIVE}")"
log "Restoring Hytale universe from ${ARCHIVE_PATH}..."

validate_archive_members
prepare_restore_work_dir
extract_archive
validate_extracted_universe
install_universe

log "Hytale universe restore completed."
