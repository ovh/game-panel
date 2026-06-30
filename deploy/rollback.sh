#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=deploy/lib/update-common.sh
. "$SCRIPT_DIR/lib/update-common.sh"

ASSUME_YES="false"
BACKUP_UNIT=""

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
      --backup)
        BACKUP_UNIT="${2:-}"
        shift 2
        ;;
      --yes|-y)
        ASSUME_YES="true"
        shift
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done
}

confirm_rollback() {
  local unit="$1"
  local from_version="$2"

  if is_true "$ASSUME_YES"; then
    return
  fi

  printf '\n'
  warn "This will restore Game Panel to the snapshot taken before updating away from version ${from_version}."
  warn "Snapshot: ${unit}"
  warn "ANY change made after that snapshot (new servers, users, settings, data) WILL BE LOST."
  printf 'Type "rollback" to continue: '
  local answer=""
  read -r answer
  [[ "$answer" == "rollback" ]] || die "Rollback cancelled."
}

main() {
  ensure_linux
  parse_args "$@"
  ensure_root "$@"
  require_cmd systemctl
  require_cmd git
  require_cmd tar

  APP_ROOT="${GP_APP_ROOT:-/opt/gamepanel}"
  COMPOSE_PROJECT_NAME="${GP_COMPOSE_PROJECT_NAME:-gamepanel}"

  APP_SOURCE_DIR="${APP_ROOT}/app"
  DEPLOY_DIR="${APP_ROOT}/deploy"
  DATA_DIR="${APP_ROOT}/data"
  REPO_DIR="${APP_ROOT}/updater/repo"
  BACKUP_DIR="${APP_ROOT}/update-backups"
  ENV_FILE="${DEPLOY_DIR}/.env"
  COMPOSE_FILE="${DEPLOY_DIR}/compose.yml"

  [[ -d "$DEPLOY_DIR" ]] || die "Missing deploy directory: $DEPLOY_DIR (is Game Panel installed?)."
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE."
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE."

  local unit=""
  if [[ -n "$BACKUP_UNIT" ]]; then
    if [[ -d "$BACKUP_UNIT" ]]; then
      unit="$BACKUP_UNIT"
    elif [[ -d "$BACKUP_DIR/$BACKUP_UNIT" ]]; then
      unit="$BACKUP_DIR/$BACKUP_UNIT"
    else
      die "Backup not found: $BACKUP_UNIT"
    fi
  else
    unit="$(latest_backup_unit)" || die "No backup found in $BACKUP_DIR; nothing to roll back to."
  fi

  local from_version=""
  from_version="$(backup_unit_from_version "$unit")"
  [[ -n "$from_version" ]] || die "Unable to read fromVersion from manifest: $unit/manifest.json"

  confirm_rollback "$unit" "$from_version"

  ensure_docker_stack

  local repo_url=""
  repo_url="$(read_env_raw_value 'GAMEPANEL_REPOSITORY_URL')"
  [[ -n "$repo_url" ]] || repo_url="https://github.com/ovh/game-panel.git"

  log "Stopping Game Panel stack..."
  compose_cmd down --remove-orphans || warn "Could not stop the stack cleanly; continuing."

  log "Restoring snapshot: $unit"
  restore_backup_unit "$unit"

  log "Checking out source for version ${from_version}..."
  prepare_repo_checkout "$repo_url" "v${from_version}"
  SOURCE_ROOT="$REPO_DIR"
  sync_project_sources

  log "Rebuilding and starting Game Panel stack..."
  compose_cmd up -d --build --remove-orphans

  printf '\n'
  log "Rollback to version ${from_version} complete."
  printf 'Compose project: %s\n' "$COMPOSE_PROJECT_NAME"
  printf 'Compose file: %s\n' "$COMPOSE_FILE"
}

main "$@"
