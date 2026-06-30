#!/usr/bin/env bash
set -euo pipefail

UPDATE_COMMON_PATH="${UPDATE_COMMON_PATH:-/usr/local/lib/gamepanel/update-common.sh}"
# shellcheck source=deploy/lib/update-common.sh
. "$UPDATE_COMMON_PATH"

sql_escape() {
  local value="${1:-}"
  value="${value//\'/\'\'}"
  printf "%s" "$value"
}

db_exec() {
  local sql="$1"
  if [[ -f "$DB_FILE" ]]; then
    sqlite3 "$DB_FILE" "$sql" || true
  fi
}

update_job() {
  local status="$1"
  local phase="$2"
  local message="${3:-}"
  local error_message="${4:-}"
  local backup_path="${5:-}"
  local now_iso
  now_iso="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

  db_exec "
    UPDATE panel_update_jobs
    SET status = '$(sql_escape "$status")',
        phase = '$(sql_escape "$phase")',
        message = '$(sql_escape "$message")',
        error_message = $(if [[ -n "$error_message" ]]; then printf "'%s'" "$(sql_escape "$error_message")"; else printf "NULL"; fi),
        backup_path = COALESCE(NULLIF('$(sql_escape "$backup_path")', ''), backup_path),
        finished_at = CASE WHEN '$(sql_escape "$status")' IN ('completed','failed') THEN '$(sql_escape "$now_iso")' ELSE finished_at END,
        updated_at = '$(sql_escape "$now_iso")'
    WHERE id = ${GP_UPDATE_JOB_ID};
  "
}

wait_for_backend_healthy() {
  local timeout_seconds=180
  local interval=5
  local elapsed=0
  local backend_id health state

  while [[ "$elapsed" -lt "$timeout_seconds" ]]; do
    backend_id="$(docker ps -q \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=backend")"

    if [[ -n "$backend_id" ]]; then
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$backend_id" 2>/dev/null || echo "")"
      if [[ "$health" == "healthy" ]]; then
        return 0
      fi
      if [[ "$health" == "none" ]]; then
        state="$(docker inspect --format '{{.State.Status}}' "$backend_id" 2>/dev/null || echo "")"
        if [[ "$state" == "running" && "$elapsed" -ge 30 ]]; then
          return 0
        fi
      fi
    fi

    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  return 1
}

on_error() {
  local exit_code=$?
  update_job "failed" "failed" "Update failed" "Update runner failed with exit code ${exit_code}"
  exit "$exit_code"
}

trap on_error ERR

GP_UPDATE_JOB_ID="${GP_UPDATE_JOB_ID:?Missing GP_UPDATE_JOB_ID}"
GP_UPDATE_VERSION="${GP_UPDATE_VERSION:?Missing GP_UPDATE_VERSION}"
GP_UPDATE_FROM_VERSION="${GP_UPDATE_FROM_VERSION:?Missing GP_UPDATE_FROM_VERSION}"
GP_UPDATE_TAG="${GP_UPDATE_TAG:?Missing GP_UPDATE_TAG}"
GP_UPDATE_REPO_URL="${GP_UPDATE_REPO_URL:?Missing GP_UPDATE_REPO_URL}"

APP_ROOT="${GP_APP_ROOT:-/opt/gamepanel}"
COMPOSE_PROJECT_NAME="${GP_COMPOSE_PROJECT_NAME:-gamepanel}"
APP_SOURCE_DIR="$APP_ROOT/app"
DEPLOY_DIR="$APP_ROOT/deploy"
DATA_DIR="$APP_ROOT/data"
REPO_DIR="$APP_ROOT/updater/repo"
BACKUP_DIR="$APP_ROOT/update-backups"
ENV_FILE="$DEPLOY_DIR/.env"
COMPOSE_FILE="$DEPLOY_DIR/compose.yml"
DB_FILE="$DATA_DIR/game-panel.db"

LOG_DIR="$BACKUP_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date -u +"%Y%m%dT%H%M%SZ")-job${GP_UPDATE_JOB_ID}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

[[ -d "$APP_ROOT" ]] || die "Missing app root: $APP_ROOT"
[[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
[[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"

update_job "running" "fetching_sources" "Fetching Game Panel sources"

prepare_repo_checkout "$GP_UPDATE_REPO_URL" "$GP_UPDATE_TAG"
assert_app_versions_match "$REPO_DIR"

update_job "running" "backing_up_data" "Creating update backup"
backup_path="$(create_backup_unit "$GP_UPDATE_FROM_VERSION" "$GP_UPDATE_VERSION")"
prune_backups

update_job "running" "syncing_sources" "Syncing updated source files" "" "$backup_path"
SOURCE_ROOT="$REPO_DIR"
sync_project_sources

append_env_if_missing "GAMEPANEL_APP_ROOT" "$APP_ROOT"
append_env_if_missing "GAMEPANEL_REPOSITORY_URL" "$GP_UPDATE_REPO_URL"

update_job "running" "running_deploy_migrations" "Running deploy migrations"
run_deploy_migrations

update_job "running" "building_stack" "Building updated containers"
if compose_cmd config --services | grep -qx 'updater'; then
  compose_cmd build updater || warn "Updater image build failed; continuing with stack rebuild."
fi

update_job "running" "restarting_stack" "Rebuilding and restarting Game Panel stack"
compose_cmd up -d --build --remove-orphans

update_job "running" "verifying_health" "Waiting for the updated panel to become healthy"
if ! wait_for_backend_healthy; then
  trap - ERR
  update_job "failed" "failed" "Update failed: the updated panel did not become healthy" \
    "The panel did not become healthy within 3 minutes and may be broken. Restore the previous version on the host with: sudo bash deploy/rollback.sh"
  die "Panel did not become healthy after the update to ${GP_UPDATE_TAG}."
fi

send_panel_updated_event || true

update_job "completed" "completed" "Update completed" "" "$backup_path"
log "Update to ${GP_UPDATE_TAG} completed."
