#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-minecraft}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/minecraft}"
LOG_FILE="${LOG_FILE:-${DATA_DIR}/logs/latest.log}"
BACKUP_LOCK_DIR="${BACKUP_LOCK_DIR:-${BACKUP_DIR}/.backup.lock}"
SERVER_JAR="${SERVER_JAR:-${DATA_DIR}/server.jar}"
SERVER_ARTIFACT="${SERVER_ARTIFACT:-${SERVER_JAR}}"
BACKUP_INCLUDE_SERVER_ARTIFACT="${BACKUP_INCLUDE_SERVER_ARTIFACT:-false}"
LOG_PREFIX="[mc-backup]"

. /app/common.sh

SAVE_OFF_WAIT_SECONDS="${SAVE_OFF_WAIT_SECONDS:-2}"
SAVE_FLUSH_WAIT_SECONDS="${SAVE_FLUSH_WAIT_SECONDS:-5}"
SAVE_ON_WAIT_SECONDS="${SAVE_ON_WAIT_SECONDS:-2}"
LOG_POLL_INTERVAL_SECONDS="${LOG_POLL_INTERVAL_SECONDS:-1}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_NAME="${BACKUP_PREFIX}-${TIMESTAMP}.tar.gz"
TMP_ARCHIVE="${BACKUP_DIR}/.${ARCHIVE_NAME}.tmp"
FINAL_ARCHIVE="${BACKUP_DIR}/${ARCHIVE_NAME}"

SAVES_DISABLED="false"
LOCK_ACQUIRED="false"

assert_safe_data_dir

mkdir -p "${BACKUP_DIR}" "${RUNTIME_DIR}"

cleanup() {
  if [ "${SAVES_DISABLED}" = "true" ]; then
    log "Re-enabling world saves..."
    /app/send-command.sh "save-on" || true
  fi

  rm -f "${TMP_ARCHIVE}" 2>/dev/null || true

  if [ "${LOCK_ACQUIRED}" = "true" ]; then
    rmdir "${BACKUP_LOCK_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

current_log_line_count() {
  if [ ! -f "${LOG_FILE}" ]; then
    echo "0"
    return 0
  fi

  wc -l < "${LOG_FILE}" | tr -d ' '
}

wait_for_log_pattern() {
  PATTERN="$1"
  TIMEOUT_SECONDS="$2"
  START_LINE="$3"
  DEADLINE=$(( $(date +%s) + TIMEOUT_SECONDS ))

  while :; do
    if [ -f "${LOG_FILE}" ] && tail -n +"$((START_LINE + 1))" "${LOG_FILE}" 2>/dev/null | grep -Fq -- "${PATTERN}"; then
      return 0
    fi

    if [ "$(date +%s)" -ge "${DEADLINE}" ]; then
      return 1
    fi

    sleep "${LOG_POLL_INTERVAL_SECONDS}"
  done
}

send_command_and_wait() {
  COMMAND="$1"
  PATTERN="$2"
  TIMEOUT_SECONDS="$3"
  START_LINE="$(current_log_line_count)"

  log "Sending command: ${COMMAND}"
  /app/send-command.sh "${COMMAND}"
  log "Waiting up to ${TIMEOUT_SECONDS}s for log pattern: ${PATTERN}"

  if wait_for_log_pattern "${PATTERN}" "${TIMEOUT_SECONDS}" "${START_LINE}"; then
    log "Confirmed log pattern: ${PATTERN}"
    return 0
  fi

  log "WARNING: Timed out waiting for log pattern: ${PATTERN}"
  return 1
}

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

  if [ ! -f "${LOG_FILE}" ]; then
    log "WARNING: Log file not found at ${LOG_FILE}. Waiting for confirmations may time out."
  fi

  log "Disabling auto-save..."
  if ! send_command_and_wait "save-off" "Automatic saving is now disabled" "${SAVE_OFF_WAIT_SECONDS}"; then
    log "Continuing backup in best-effort mode after save-off timeout..."
  fi
  SAVES_DISABLED="true"

  log "Flushing world state to disk..."
  if ! send_command_and_wait "save-all flush" "Saved the game" "${SAVE_FLUSH_WAIT_SECONDS}"; then
    log "Continuing backup in best-effort mode after save-all flush timeout..."
  fi

  log "Creating archive..."
  build_backup_archive

  mv "${TMP_ARCHIVE}" "${FINAL_ARCHIVE}"

  log "Re-enabling world saves..."
  if ! send_command_and_wait "save-on" "Automatic saving is now enabled" "${SAVE_ON_WAIT_SECONDS}"; then
    log "Continuing after save-on timeout..."
  fi
  SAVES_DISABLED="false"
}

run_cold_backup() {
  log "Starting cold backup..."
  log "Minecraft server is not running; skipping in-game save commands."
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

if is_minecraft_server_running; then
  run_hot_backup
else
  run_cold_backup
fi

log "Backup completed: ${FINAL_ARCHIVE}"
