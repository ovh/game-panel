#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
PALWORLD_INSTALL_DIR="${PALWORLD_INSTALL_DIR:-${DATA_DIR}/server}"
PALWORLD_SAVEGAMES_DIR="${PALWORLD_SAVEGAMES_DIR:-${PALWORLD_INSTALL_DIR}/Pal/Saved/SaveGames/0}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/palworld}"
RESTORE_BACKUP="${RESTORE_BACKUP:-${1:-}}"
LOG_PREFIX="[palworld-restore]"

. /app/common.sh

LOCK_ACQUIRED="false"
RESTORE_LOCK_DIR=""
RESTORE_SUCCESS="false"
ITEMS_MOVED="false"
WORLD_DIR=""
BACKUP_DIR=""
WORK_DIR=""
OLD_DIR=""
NEW_DIR=""

usage() {
  echo "Usage: /app/restore.sh <backup-name-or-path>" >&2
  echo "Example: /app/restore.sh 2026.07.02-09.19.51" >&2
}

cleanup() {
  if [ "${RESTORE_SUCCESS}" != "true" ] && [ "${ITEMS_MOVED}" = "true" ] && [ -d "${OLD_DIR}" ]; then
    log "Restore failed before completion, rolling back previous save..."
    for OLD_ITEM in "${OLD_DIR}"/* "${OLD_DIR}"/.[!.]*; do
      [ -e "${OLD_ITEM}" ] || continue
      ITEM_NAME="$(basename "${OLD_ITEM}")"
      rm -rf "${WORLD_DIR:?}/${ITEM_NAME}" 2>/dev/null || true
      mv "${OLD_ITEM}" "${WORLD_DIR}/" 2>/dev/null || true
    done
    ITEMS_MOVED="false"
  fi

  if [ -n "${WORK_DIR}" ] && [ -d "${WORK_DIR}" ]; then
    rm -rf "${WORK_DIR}" 2>/dev/null || true
  fi

  if [ "${LOCK_ACQUIRED}" = "true" ] && [ -n "${RESTORE_LOCK_DIR}" ]; then
    rmdir "${RESTORE_LOCK_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

discover_world_dir() {
  if [ ! -d "${PALWORLD_SAVEGAMES_DIR}" ]; then
    die "Save directory not found: ${PALWORLD_SAVEGAMES_DIR}"
  fi

  FOUND=""
  COUNT=0
  for CANDIDATE in "${PALWORLD_SAVEGAMES_DIR}"/*/; do
    [ -d "${CANDIDATE}" ] || continue
    FOUND="${CANDIDATE%/}"
    COUNT=$((COUNT + 1))
  done

  if [ "${COUNT}" -eq 0 ]; then
    die "No world save found under ${PALWORLD_SAVEGAMES_DIR}."
  fi

  if [ "${COUNT}" -gt 1 ]; then
    die "Expected exactly one world save under ${PALWORLD_SAVEGAMES_DIR}, found ${COUNT}."
  fi

  printf '%s\n' "${FOUND}"
}

resolve_backup_dir() {
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
      CANDIDATE="${WORLD_DIR}/backup/world/${INPUT}"
      ;;
  esac

  if [ ! -d "${CANDIDATE}" ]; then
    die "Backup not found: ${CANDIDATE}"
  fi

  printf '%s\n' "${CANDIDATE%/}"
}

validate_backup_dir() {
  if find "${BACKUP_DIR}" -type l | grep . >/dev/null 2>&1; then
    die "Backup contains symbolic links, which are not supported by restore."
  fi

  if ! find "${BACKUP_DIR}" -mindepth 1 -print -quit | grep . >/dev/null 2>&1; then
    die "Backup is empty, nothing to restore: ${BACKUP_DIR}"
  fi
}

assert_safe_data_dir
assert_writable_dir "${DATA_DIR}"
mkdir -p "${RUNTIME_DIR}"

assert_palworld_server_stopped

WORLD_DIR="$(discover_world_dir)"
BACKUP_DIR="$(resolve_backup_dir "${RESTORE_BACKUP}")"

case "${BACKUP_DIR}" in
  "${WORLD_DIR}"|"${WORLD_DIR}/backup"|"${WORLD_DIR}/backup/world")
    die "Refusing to restore from ${BACKUP_DIR}."
    ;;
esac

RESTORE_LOCK_DIR="${WORLD_DIR}/.restore.lock"
if ! mkdir "${RESTORE_LOCK_DIR}" 2>/dev/null; then
  die "Another restore operation appears to be running: ${RESTORE_LOCK_DIR}"
fi
LOCK_ACQUIRED="true"

log "Restoring Palworld world from ${BACKUP_DIR}..."

validate_backup_dir

WORK_DIR="$(mktemp -d "${WORLD_DIR}/.restore-work.XXXXXX")"
OLD_DIR="${WORK_DIR}/old"
NEW_DIR="${WORK_DIR}/new"
mkdir -p "${OLD_DIR}" "${NEW_DIR}"

cp -a "${BACKUP_DIR}/." "${NEW_DIR}/"

ITEMS_MOVED="true"
for NEW_ITEM in "${NEW_DIR}"/* "${NEW_DIR}"/.[!.]*; do
  [ -e "${NEW_ITEM}" ] || continue
  ITEM_NAME="$(basename "${NEW_ITEM}")"

  if [ -e "${WORLD_DIR}/${ITEM_NAME}" ]; then
    mv "${WORLD_DIR}/${ITEM_NAME}" "${OLD_DIR}/"
  fi

  mv "${NEW_ITEM}" "${WORLD_DIR}/"
done

RESTORE_SUCCESS="true"

log "Palworld world restore completed."
