#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=deploy/lib/update-common.sh
. "$SCRIPT_DIR/lib/update-common.sh"

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --app-root)
        GP_APP_ROOT="${2:-}"
        shift 2
        ;;
      --project-name)
        GP_COMPOSE_PROJECT_NAME="${2:-}"
        shift 2
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done
}

wait_for_stack() {
  local max_attempts=60
  local sleep_seconds=2

  for ((i=1; i<=max_attempts; i++)); do
    local backend_id=""
    local frontend_id=""
    local traefik_id=""

    backend_id="$(docker ps -q \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=backend")"
    frontend_id="$(docker ps -q \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=frontend")"
    traefik_id="$(docker ps -q \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=traefik")"

    if [[ -n "$backend_id" && -n "$frontend_id" && -n "$traefik_id" ]]; then
      if wait_for_panel_http 90; then
        return 0
      fi

      warn "The stack is up but the panel is not reachable through Traefik."
      return 1
    fi

    sleep "$sleep_seconds"
  done

  warn "Stack did not become fully ready in time. Current status:"
  compose_cmd ps || true
  return 1
}

main() {
  ensure_linux
  parse_args "$@"
  ensure_root "$@"
  require_cmd systemctl

  LOCAL_SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  require_local_source_tree "$LOCAL_SOURCE_ROOT"

  APP_ROOT="${GP_APP_ROOT:-/opt/gamepanel}"
  COMPOSE_PROJECT_NAME="${GP_COMPOSE_PROJECT_NAME:-gamepanel}"

  APP_SOURCE_DIR="${APP_ROOT}/app"
  DEPLOY_DIR="${APP_ROOT}/deploy"
  DATA_DIR="${APP_ROOT}/data"
  BACKUP_DIR="${APP_ROOT}/update-backups"
  ENV_FILE="${DEPLOY_DIR}/.env"
  COMPOSE_FILE="${DEPLOY_DIR}/compose.yml"

  [[ -d "$APP_SOURCE_DIR" ]] || die "Missing app source directory: $APP_SOURCE_DIR (run install first)."
  [[ -d "$DEPLOY_DIR" ]] || die "Missing deploy directory: $DEPLOY_DIR (run install first)."
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE (run install first)."
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE (run install first)."

  ensure_docker_stack

  log "Using local source tree from $LOCAL_SOURCE_ROOT."
  SOURCE_ROOT="$LOCAL_SOURCE_ROOT"
  assert_app_versions_match "$SOURCE_ROOT"

  local from_version="" to_version="" backup_path=""
  from_version="$(read_app_version "$APP_SOURCE_DIR")"
  to_version="$(read_app_version "$SOURCE_ROOT")"

  log "Creating the update backup..."
  backup_path="$(create_backup_unit "$from_version" "$to_version")"
  prune_backups
  log "Backup created: $backup_path"

  sync_project_sources

  render_compose_if_available

  log "Running deploy migrations..."
  run_deploy_migrations

  log "Pulling updater image..."
  pull_updater_image_best_effort "ovhcom/gamepanel-updater:$(read_app_version "$APP_SOURCE_DIR")"

  log "Rebuilding and starting updated GamePanel stack..."
  compose_cmd build --pull
  compose_cmd up -d --remove-orphans

  local stack_ready=0
  wait_for_stack || stack_ready=1

  printf '\n'
  if [[ "$stack_ready" -eq 0 ]]; then
    send_panel_updated_event
    log "Update complete."
  else
    warn "Update finished but the panel did not answer; this installation may be broken."
    warn "If it stays unreachable, restore the previous version with: sudo bash deploy/rollback.sh"
  fi
  printf 'Compose project: %s\n' "$COMPOSE_PROJECT_NAME"
  printf 'Compose file: %s\n' "$COMPOSE_FILE"
}

main "$@"
