#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-minecraft-bedrock}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft-bedrock}"
BACKUP_LOCK_DIR="${BACKUP_LOCK_DIR:-${BACKUP_DIR}/.backup.lock}"
BEDROCK_SERVER_BIN="${BEDROCK_SERVER_BIN:-${DATA_DIR}/bedrock_server}"
SERVER_ARTIFACT="${SERVER_ARTIFACT:-${BEDROCK_SERVER_BIN}}"
BACKUP_INCLUDE_SERVER_ARTIFACT="${BACKUP_INCLUDE_SERVER_ARTIFACT:-false}"
SAVE_HOLD_WAIT_SECONDS="${SAVE_HOLD_WAIT_SECONDS:-2}"
SAVE_QUERY_WAIT_SECONDS="${SAVE_QUERY_WAIT_SECONDS:-2}"
SAVE_RESUME_WAIT_SECONDS="${SAVE_RESUME_WAIT_SECONDS:-1}"
LOG_PREFIX="[bedrock-backup]"

. /app/common.sh

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_NAME="${BACKUP_PREFIX}-${TIMESTAMP}.tar.gz"
TMP_ARCHIVE="${BACKUP_DIR}/.${ARCHIVE_NAME}.tmp"
FINAL_ARCHIVE="${BACKUP_DIR}/${ARCHIVE_NAME}"

SAVE_HELD="false"
LOCK_ACQUIRED="false"

assert_safe_data_dir

mkdir -p "${BACKUP_DIR}" "${RUNTIME_DIR}"

cleanup() {
  if [ "${SAVE_HELD}" = "true" ]; then
    log "Resuming world saves..."
    /app/send-command.sh "save resume" || true
  fi

  rm -f "${TMP_ARCHIVE}" 2>/dev/null || true

  if [ "${LOCK_ACQUIRED}" = "true" ]; then
    rmdir "${BACKUP_LOCK_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

build_backup_archive() {
  SERVER_ARTIFACT_RELATIVE="$(server_artifact_relative_to_data || true)"

  if is_truthy "${BACKUP_INCLUDE_SERVER_ARTIFACT}"; then
    if [ -n "${SERVER_ARTIFACT_RELATIVE}" ]; then
      log "Including server artifact in backup: ${SERVER_ARTIFACT_RELATIVE}"
    else
      log "WARNING: SERVER_ARTIFACT is outside ${DATA_DIR} and will not be included in this backup."
    fi

    tar -czf "${TMP_ARCHIVE}" -C "${DATA_DIR}" .
    return 0
  fi

  if [ -n "${SERVER_ARTIFACT_RELATIVE}" ]; then
    log "Excluding server artifact from backup: ${SERVER_ARTIFACT_RELATIVE}"
    tar --exclude="./${SERVER_ARTIFACT_RELATIVE}" -czf "${TMP_ARCHIVE}" -C "${DATA_DIR}" .
    return 0
  fi

  log "Server artifact is outside ${DATA_DIR}; nothing to exclude from backup archive."
  tar -czf "${TMP_ARCHIVE}" -C "${DATA_DIR}" .
}

run_hot_backup() {
  log "Starting hot backup..."

  log "Holding Bedrock saves..."
  /app/send-command.sh "save hold"
  SAVE_HELD="true"
  sleep "${SAVE_HOLD_WAIT_SECONDS}"

  log "Querying pending save state..."
  /app/send-command.sh "save query" || true
  sleep "${SAVE_QUERY_WAIT_SECONDS}"

  log "Creating archive..."
  build_backup_archive
  mv "${TMP_ARCHIVE}" "${FINAL_ARCHIVE}"

  log "Resuming world saves..."
  /app/send-command.sh "save resume"
  SAVE_HELD="false"
  sleep "${SAVE_RESUME_WAIT_SECONDS}"
}

run_cold_backup() {
  log "Starting cold backup..."
  log "Bedrock server is not running; skipping in-game save commands."
  log "Creating archive..."
  build_backup_archive
  mv "${TMP_ARCHIVE}" "${FINAL_ARCHIVE}"
}

assert_writable_dir "${BACKUP_DIR}"

if ! mkdir "${BACKUP_LOCK_DIR}" 2>/dev/null; then
  die "Another backup is already running."
fi
LOCK_ACQUIRED="true"

if [ ! -d "${DATA_DIR}" ]; then
  die "Data directory not found: ${DATA_DIR}"
fi

log "Backup file: ${FINAL_ARCHIVE}"

if is_bedrock_server_running; then
  run_hot_backup
else
  run_cold_backup
fi

log "Backup completed: ${FINAL_ARCHIVE}"
