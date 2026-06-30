#!/usr/bin/env bash

if ! declare -F log >/dev/null 2>&1; then
  log() {
    printf '[INFO] %s\n' "$*" >&2
  }
fi

if ! declare -F warn >/dev/null 2>&1; then
  warn() {
    printf '[WARN] %s\n' "$*" >&2
  }
fi

if ! declare -F die >/dev/null 2>&1; then
  die() {
    printf '[ERROR] %s\n' "$*" >&2
    exit 1
  }
fi

if ! declare -F is_true >/dev/null 2>&1; then
  is_true() {
    case "${1:-}" in
      1|true|TRUE|yes|YES|y|Y) return 0 ;;
      *) return 1 ;;
    esac
  }
fi

update_canonical_path() {
  local path="$1"
  if [[ -d "$path" ]]; then
    (cd "$path" && pwd -P)
  else
    printf '%s' "$path"
  fi
}

escape_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\$/\$\$}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
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

pull_updater_image_best_effort() {
  local image="$1"

  if [[ -z "$image" ]]; then
    return
  fi

  if docker pull "$image"; then
    log "Updater image is available: $image"
  else
    warn "Unable to pull updater image now: $image"
  fi
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

read_package_json_version() {
  awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "$1"
}

assert_app_versions_match() {
  local source_root="$1"
  local backend_version frontend_version
  backend_version="$(read_package_json_version "$source_root/backend/package.json")"
  frontend_version="$(read_package_json_version "$source_root/frontend/package.json")"
  [[ -n "$backend_version" ]] || die "Unable to read backend version from $source_root/backend/package.json"
  [[ -n "$frontend_version" ]] || die "Unable to read frontend version from $source_root/frontend/package.json"
  [[ "$backend_version" == "$frontend_version" ]] || \
    die "Version mismatch: backend=$backend_version, frontend=$frontend_version (they must be identical)."
}

prepare_repo_checkout() {
  local repo_url="$1"
  local tag="$2"

  mkdir -p "$REPO_DIR"
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    rm -rf "$REPO_DIR"
    git clone --no-checkout "$repo_url" "$REPO_DIR"
  else
    git -C "$REPO_DIR" remote set-url origin "$repo_url"
  fi

  git -C "$REPO_DIR" fetch --tags --prune origin
  git -C "$REPO_DIR" checkout --force "$tag"
}

create_backup_unit() {
  local from_version="$1"
  local to_version="$2"
  local timestamp created_at unit

  timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  unit="$BACKUP_DIR/${timestamp}-${from_version}-to-${to_version}"

  mkdir -p "$unit"
  tar -C "$APP_ROOT" -czf "$unit/data.tar.gz" data
  if [[ -f "$ENV_FILE" ]]; then
    cp -p "$ENV_FILE" "$unit/.env"
  fi
  if [[ -f "$COMPOSE_FILE" ]]; then
    cp -p "$COMPOSE_FILE" "$unit/compose.yml"
  fi
  printf '{"fromVersion":"%s","toVersion":"%s","createdAt":"%s"}\n' \
    "$from_version" "$to_version" "$created_at" >"$unit/manifest.json"

  printf '%s' "$unit"
}

restore_backup_unit() {
  local unit="$1"

  [[ -d "$unit" ]] || die "Backup unit not found: $unit"
  [[ -f "$unit/data.tar.gz" ]] || die "Backup unit is missing data.tar.gz: $unit"

  rm -rf "$DATA_DIR"
  tar -C "$APP_ROOT" -xzf "$unit/data.tar.gz"

  if [[ -f "$unit/.env" ]]; then
    cp -p "$unit/.env" "$ENV_FILE"
  fi
  if [[ -f "$unit/compose.yml" ]]; then
    cp -p "$unit/compose.yml" "$COMPOSE_FILE"
  fi
}

latest_backup_unit() {
  [[ -d "$BACKUP_DIR" ]] || return 1

  local newest=""
  newest="$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d ! -name logs | sort -r | sed -n '1p')"
  [[ -n "$newest" ]] || return 1

  printf '%s' "$newest"
}

backup_unit_from_version() {
  local unit="$1"
  awk -F'"' '/"fromVersion"/ { print $4; exit }' "$unit/manifest.json"
}

prune_backups() {
  local keep="${GP_BACKUP_RETENTION:-5}"
  local n entry

  [[ -d "$BACKUP_DIR" ]] || return 0

  n=0
  while IFS= read -r entry; do
    n=$((n + 1))
    if [[ "$n" -gt "$keep" ]]; then
      rm -rf "$entry"
    fi
  done < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d ! -name logs | sort -r)

  [[ -d "$BACKUP_DIR/logs" ]] || return 0

  n=0
  while IFS= read -r entry; do
    n=$((n + 1))
    if [[ "$n" -gt "$keep" ]]; then
      rm -f "$entry"
    fi
  done < <(find "$BACKUP_DIR/logs" -maxdepth 1 -type f -name '*.log' | sort -r)
}

sync_project_sources() {
  local source_root_real target_root_real

  source_root_real="$(update_canonical_path "$SOURCE_ROOT")"
  target_root_real="$(update_canonical_path "$APP_SOURCE_DIR")"

  if [[ "$source_root_real" == "$target_root_real" ]]; then
    log "Source root is already $APP_SOURCE_DIR; skipping source sync."
    return
  fi

  log "Syncing project sources to $APP_SOURCE_DIR..."
  mkdir -p "$APP_SOURCE_DIR"

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

run_deploy_migrations() {
  local migrations_dir="$APP_SOURCE_DIR/deploy/migrations"
  local applied_file="$DATA_DIR/deploy-migrations.applied"
  local migration id

  [[ -d "$migrations_dir" ]] || return
  touch "$applied_file"

  for migration in "$migrations_dir"/*.sh; do
    [[ -f "$migration" ]] || continue
    id="$(basename "$migration" .sh)"

    if grep -qx "$id" "$applied_file"; then
      continue
    fi

    log "Running deploy migration: $id"
    GP_APP_ROOT="$APP_ROOT" \
    GP_APP_SOURCE_DIR="$APP_SOURCE_DIR" \
    GP_DEPLOY_DIR="$DEPLOY_DIR" \
    GP_DATA_DIR="$DATA_DIR" \
    GP_COMPOSE_FILE="$COMPOSE_FILE" \
    GP_ENV_FILE="$ENV_FILE" \
      bash "$migration"

    printf '%s\n' "$id" >>"$applied_file"
  done
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
    return 0
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
    return 0
  fi

  if [[ -z "$instance_id" || -z "$instance_secret" || -z "$telemetry_api_base_url" ]]; then
    warn "Skipping panel.updated telemetry because the instance credentials or telemetry URL are missing."
    return 0
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
