#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

DEFAULT_GITHUB_REPO_URL="https://github.com/ovh/game-panel.git"
DEFAULT_GITHUB_REPO_BRANCH="main"

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --source-mode)
        GP_SOURCE_MODE="${2:-}"
        shift 2
        ;;
      --local)
        GP_SOURCE_MODE="local"
        shift
        ;;
      --github)
        GP_SOURCE_MODE="github"
        shift
        ;;
      --repo-branch)
        GP_REPO_BRANCH="${2:-}"
        shift 2
        ;;
      --checkout-dir)
        GP_CHECKOUT_DIR="${2:-}"
        shift 2
        ;;
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

resolve_source_root() {
  local local_source_root="$1"
  local source_mode="${GP_SOURCE_MODE:-github}"

  case "$source_mode" in
    local)
      [[ -d "$local_source_root/backend" ]] || die "Local source not found: $local_source_root/backend"
      [[ -d "$local_source_root/frontend" ]] || die "Local source not found: $local_source_root/frontend"
      [[ -d "$local_source_root/deploy" ]] || die "Local source not found: $local_source_root/deploy"
      printf '%s' "$local_source_root"
      return
      ;;
    github)
      is_true "${GP_ENABLE_GITHUB_FETCH:-1}" || die \
        "GitHub fetch is disabled by GP_ENABLE_GITHUB_FETCH=0. Use '--local' to update from local sources."

      require_cmd git

      local repo_url="$DEFAULT_GITHUB_REPO_URL"
      local repo_branch="${GP_REPO_BRANCH:-$DEFAULT_GITHUB_REPO_BRANCH}"
      local checkout_dir="${GP_CHECKOUT_DIR:-/opt/gamepanel-src}"

      if [[ -d "$checkout_dir/.git" ]]; then
        log "Updating repository in $checkout_dir..."
        git -C "$checkout_dir" fetch --all --prune
        git -C "$checkout_dir" checkout "$repo_branch"
        git -C "$checkout_dir" pull --ff-only origin "$repo_branch"
      else
        log "Cloning repository $repo_url (branch: $repo_branch) into $checkout_dir..."
        mkdir -p "$(dirname "$checkout_dir")"
        git clone --branch "$repo_branch" "$repo_url" "$checkout_dir"
      fi

      [[ -d "$checkout_dir/backend" ]] || die "Fetched source is missing backend directory: $checkout_dir/backend"
      [[ -d "$checkout_dir/frontend" ]] || die "Fetched source is missing frontend directory: $checkout_dir/frontend"
      [[ -d "$checkout_dir/deploy" ]] || die "Fetched source is missing deploy directory: $checkout_dir/deploy"
      printf '%s' "$checkout_dir"
      return
      ;;
    *)
      die "Invalid source mode: $source_mode (allowed: local, github)"
      ;;
  esac
}

sync_project_sources() {
  local source_root_real target_root_real
  source_root_real="$(canonical_path "$SOURCE_ROOT")"
  target_root_real="$(canonical_path "$APP_SOURCE_DIR")"

  if [[ "$source_root_real" == "$target_root_real" ]]; then
    log "Source root is already $APP_SOURCE_DIR; skipping source sync."
    return
  fi

  log "Syncing project sources to $APP_SOURCE_DIR..."
  rm -rf \
    "$APP_SOURCE_DIR/backend" \
    "$APP_SOURCE_DIR/frontend" \
    "$APP_SOURCE_DIR/deploy"

  tar -C "$SOURCE_ROOT" -cf - \
    --exclude='.git' \
    --exclude='backend/node_modules' \
    --exclude='backend/dist' \
    --exclude='backend/.env' \
    --exclude='frontend/node_modules' \
    --exclude='frontend/dist' \
    backend \
    frontend \
    deploy \
    | tar -C "$APP_SOURCE_DIR" -xf -
}

escape_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 48
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(48))
PY
    return
  fi

  tr -dc 'A-Fa-f0-9' </dev/urandom | head -c 96
}

generate_uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
    return
  fi

  if [[ -r /proc/sys/kernel/random/uuid ]]; then
    cat /proc/sys/kernel/random/uuid
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import uuid
print(str(uuid.uuid4()))
PY
    return
  fi

  die "Unable to generate a UUID (missing uuidgen, /proc/sys/kernel/random/uuid, and python3)."
}

read_app_version() {
  local source_root="$1"
  local package_file="$source_root/backend/package.json"

  [[ -f "$package_file" ]] || die "Missing backend package.json file: $package_file"

  local version=""
  version="$(awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "$package_file")"
  [[ -n "$version" ]] || die "Unable to read version from: $package_file"

  printf '%s' "$version"
}

read_env_raw_value() {
  local key="$1"
  local raw=""

  raw="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
  raw="${raw%\"}"
  raw="${raw#\"}"

  printf '%s' "$raw"
}

append_env_if_missing() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then
    return
  fi

  printf '%s=%s\n' "$key" "$(escape_env_value "$value")" >>"$ENV_FILE"
}

ensure_runtime_env_defaults() {
  local current_db_api_base_url=""

  current_db_api_base_url="$(read_env_raw_value 'VITE_DB_API_BASE_URL')"
  if [[ -z "$current_db_api_base_url" ]]; then
    current_db_api_base_url="https://db.gamepanel.ovh/"
  fi

  append_env_if_missing 'APP_INSTANCE_ID' "$(generate_uuid)"
  append_env_if_missing 'APP_INSTANCE_SECRET' "$(generate_secret)"
  append_env_if_missing 'TRUST_PROXY' "1"
  append_env_if_missing 'TELEMETRY_ENABLED' "true"
  append_env_if_missing 'TELEMETRY_API_BASE_URL' "$current_db_api_base_url"
}

send_panel_updated_event() {
  local instance_id=""
  local instance_secret=""
  local telemetry_api_base_url=""
  local telemetry_enabled=""
  local domain=""
  local app_version=""
  local payload=""
  local response_file=""
  local status_code=""
  local event_at=""

  if ! command -v curl >/dev/null 2>&1; then
    warn "curl is not available; skipping panel.updated telemetry."
    return
  fi

  instance_id="$(read_env_raw_value 'APP_INSTANCE_ID')"
  instance_secret="$(read_env_raw_value 'APP_INSTANCE_SECRET')"
  telemetry_api_base_url="$(read_env_raw_value 'TELEMETRY_API_BASE_URL')"
  telemetry_enabled="$(read_env_raw_value 'TELEMETRY_ENABLED')"
  domain="$(read_env_raw_value 'DOMAIN')"
  app_version="$(read_app_version "$APP_SOURCE_DIR")"
  event_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if ! is_true "${telemetry_enabled:-1}"; then
    warn "Telemetry disabled; skipping panel.updated telemetry."
    return
  fi

  if [[ -z "$instance_id" || -z "$instance_secret" || -z "$telemetry_api_base_url" ]]; then
    warn "Skipping panel.updated telemetry because the instance credentials or telemetry URL are missing."
    return
  fi

  payload="$(cat <<EOF
{"instanceId":$(escape_env_value "$instance_id"),"instanceSecret":$(escape_env_value "$instance_secret"),"eventType":"panel.updated","version":$(escape_env_value "$app_version"),"domain":$(escape_env_value "$domain"),"at":$(escape_env_value "$event_at")}
EOF
)"
  response_file="$(mktemp)"

  status_code="$(
    curl -sS \
      -o "$response_file" \
      -w '%{http_code}' \
      --max-time 5 \
      -H 'Content-Type: application/json' \
      -d "$payload" \
      "${telemetry_api_base_url%/}/ingest/events" || true
  )"

  case "$status_code" in
    200|201)
      log "panel.updated telemetry sent."
      ;;
    000|"")
      warn "Central database is unreachable right now; skipping panel.updated telemetry."
      ;;
    *)
      warn "Central database returned HTTP ${status_code} for panel.updated telemetry."
      ;;
  esac

  rm -f "$response_file"
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose \
      --project-name "$COMPOSE_PROJECT_NAME" \
      --env-file "$ENV_FILE" \
      -f "$COMPOSE_FILE" \
      "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose \
      -p "$COMPOSE_PROJECT_NAME" \
      --env-file "$ENV_FILE" \
      -f "$COMPOSE_FILE" \
      "$@"
    return
  fi

  die "No docker compose command found."
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
      return
    fi

    sleep "$sleep_seconds"
  done

  warn "Stack did not become fully ready in time. Current status:"
  compose_cmd ps || true
}

main() {
  ensure_linux
  parse_args "$@"
  ensure_root "$@"
  require_cmd systemctl

  GP_SOURCE_MODE="${GP_SOURCE_MODE:-github}"
  LOCAL_SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

  APP_ROOT="${GP_APP_ROOT:-/opt/gamepanel}"
  COMPOSE_PROJECT_NAME="${GP_COMPOSE_PROJECT_NAME:-gamepanel}"

  APP_SOURCE_DIR="${APP_ROOT}/app"
  DEPLOY_DIR="${APP_ROOT}/deploy"
  ENV_FILE="${DEPLOY_DIR}/.env"
  COMPOSE_FILE="${DEPLOY_DIR}/compose.yml"

  [[ -d "$APP_SOURCE_DIR" ]] || die "Missing app source directory: $APP_SOURCE_DIR (run install first)."
  [[ -d "$DEPLOY_DIR" ]] || die "Missing deploy directory: $DEPLOY_DIR (run install first)."
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE (run install first)."
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE (run install first)."

  ensure_docker_stack
  ensure_compose_traefik_image "$COMPOSE_FILE"

  log "Resolving source mode: ${GP_SOURCE_MODE}"
  SOURCE_ROOT="$(resolve_source_root "$LOCAL_SOURCE_ROOT")"

  sync_project_sources
  ensure_runtime_env_defaults

  log "Stopping current GamePanel stack..."
  compose_cmd down

  log "Rebuilding and starting updated GamePanel stack..."
  compose_cmd up -d --build

  wait_for_stack
  send_panel_updated_event

  printf '\n'
  log "Update complete."
  printf 'Compose project: %s\n' "$COMPOSE_PROJECT_NAME"
  printf 'Compose file: %s\n' "$COMPOSE_FILE"
}

main "$@"
