#!/usr/bin/env bash
set -eEuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

escape_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\$/\$\$}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

INSTALL_LOG_FILE="${GP_INSTALL_LOG_FILE:-/var/log/ovh-gamepanel-install.log}"
INSTALL_LOG_ACTIVE=0
INSTALL_FAIL_LINE=""
INSTALL_FAIL_CMD=""

on_install_err() {
  INSTALL_FAIL_LINE="$1"
  INSTALL_FAIL_CMD="$2"
}

on_install_exit() {
  local code=$?
  [ "$INSTALL_LOG_ACTIVE" -eq 1 ] || return 0
  if [ "$code" -eq 0 ]; then
    printf '[OK] install completed %s\n' "$(date -u +%FT%TZ)" >>"$INSTALL_LOG_FILE"
  elif [ -n "$INSTALL_FAIL_CMD" ]; then
    printf '[FAILED] install aborted %s at line %s (exit %s): %s\n' \
      "$(date -u +%FT%TZ)" "$INSTALL_FAIL_LINE" "$code" "$INSTALL_FAIL_CMD" >>"$INSTALL_LOG_FILE"
  else
    printf '[FAILED] install aborted %s (exit %s)\n' \
      "$(date -u +%FT%TZ)" "$code" >>"$INSTALL_LOG_FILE"
  fi
}

setup_install_logging() {
  if { : >>"$INSTALL_LOG_FILE"; } 2>/dev/null; then
    INSTALL_LOG_ACTIVE=1
    printf '===== install started %s (v%s) =====\n' "$(date -u +%FT%TZ)" "${APP_VERSION:-unknown}" >>"$INSTALL_LOG_FILE"
    exec > >(tee -a "$INSTALL_LOG_FILE") 2>&1
    log "Writing install log to $INSTALL_LOG_FILE"
  else
    warn "Could not open $INSTALL_LOG_FILE; continuing without a file log."
  fi
  trap 'on_install_err "$LINENO" "$BASH_COMMAND"' ERR
  trap on_install_exit EXIT
}

is_valid_ipv4() {
  local ip="$1"
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  local IFS='.'
  local a b c d octet
  read -r a b c d <<<"$ip"
  for octet in "$a" "$b" "$c" "$d"; do
    [[ "$octet" =~ ^[0-9]+$ ]] || return 1
    ((octet >= 0 && octet <= 255)) || return 1
  done
  return 0
}

is_valid_ipv6() {
  local ip="$1"
  [[ "$ip" =~ ^[0-9a-fA-F:]+$ ]] || return 1
  [[ "$ip" == *:* ]] || return 1
  return 0
}

is_loopback_ipv4() {
  local ip="$1"
  [[ "$ip" =~ ^127\. ]] || return 1
  return 0
}

is_loopback_ipv6() {
  local ip="$1"
  [[ "$ip" == "::1" || "$ip" == "0:0:0:0:0:0:0:1" ]] || return 1
  return 0
}

unique_lines() {
  awk 'NF && !seen[$0]++'
}

resolve_domain_ipv4() {
  local domain="$1"
  if command -v dig >/dev/null 2>&1; then
    dig +short A "$domain" | awk '{gsub(/[[:space:]]+/, "", $0); print $0}'
    return
  fi

  if command -v getent >/dev/null 2>&1; then
    getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}'
  fi
}

resolve_domain_ipv6() {
  local domain="$1"
  if command -v dig >/dev/null 2>&1; then
    dig +short AAAA "$domain" | awk '{gsub(/[[:space:]]+/, "", $0); print $0}'
    return
  fi

  if command -v getent >/dev/null 2>&1; then
    getent ahostsv6 "$domain" 2>/dev/null | awk '{print $1}' | grep -v '^::ffff:' || true
  fi
}

detect_host_ipv4_candidates() {
  if command -v ip >/dev/null 2>&1; then
    ip -o -4 addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1
    ip -4 route get 1.1.1.1 2>/dev/null | awk '
      {
        for (i = 1; i <= NF; i++) {
          if ($i == "src" && (i + 1) <= NF) {
            print $(i + 1);
            exit;
          }
        }
      }'
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -4fsS --max-time 4 https://api64.ipify.org 2>/dev/null || true
  fi
}

detect_host_ipv6_candidates() {
  if command -v ip >/dev/null 2>&1; then
    ip -o -6 addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1
    ip -6 route get 2606:4700:4700::1111 2>/dev/null | awk '
      {
        for (i = 1; i <= NF; i++) {
          if ($i == "src" && (i + 1) <= NF) {
            print $(i + 1);
            exit;
          }
        }
      }'
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -6fsS --max-time 4 https://api64.ipify.org 2>/dev/null || true
  fi
}

array_join() {
  local delimiter="$1"
  shift
  local item
  local first=1
  for item in "$@"; do
    if [[ $first -eq 1 ]]; then
      printf '%s' "$item"
      first=0
    else
      printf '%s%s' "$delimiter" "$item"
    fi
  done
}

lists_intersect() {
  local list_a="$1"
  local list_b="$2"

  for a in $list_a; do
    for b in $list_b; do
      if [[ "$a" == "$b" ]]; then
        return 0
      fi
    done
  done
  return 1
}

lists_all_loopback() {
  local list_a="$1"
  local list_b="$2"
  local ip
  local seen=1

  for ip in $list_a; do
    is_loopback_ipv4 "$ip" || return 1
    seen=0
  done
  for ip in $list_b; do
    is_loopback_ipv6 "$ip" || return 1
    seen=0
  done
  return $seen
}

verify_domain_points_to_machine() {
  local domain="$1"

  if is_true "${GP_SKIP_DOMAIN_IP_CHECK:-0}"; then
    warn "Skipping domain/IP verification (GP_SKIP_DOMAIN_IP_CHECK=1)."
    return
  fi

  mapfile -t domain_ipv4 < <(resolve_domain_ipv4 "$domain" | while read -r ip; do is_valid_ipv4 "$ip" && echo "$ip"; done | unique_lines)
  mapfile -t domain_ipv6 < <(resolve_domain_ipv6 "$domain" | while read -r ip; do is_valid_ipv6 "$ip" && echo "$ip"; done | unique_lines)

  if [[ ${#domain_ipv4[@]} -eq 0 && ${#domain_ipv6[@]} -eq 0 ]]; then
    die "Domain '$domain' has no valid A or AAAA records."
  fi

  mapfile -t host_ipv4 < <(detect_host_ipv4_candidates | while read -r ip; do is_valid_ipv4 "$ip" && echo "$ip"; done | unique_lines)
  mapfile -t host_ipv6 < <(detect_host_ipv6_candidates | while read -r ip; do is_valid_ipv6 "$ip" && echo "$ip"; done | unique_lines)

  if [[ ${#host_ipv4[@]} -eq 0 && ${#host_ipv6[@]} -eq 0 ]]; then
    die "Unable to detect host IP candidates for DNS verification."
  fi

  local domain_v4_list="${domain_ipv4[*]}"
  local domain_v6_list="${domain_ipv6[*]}"
  local host_v4_list="${host_ipv4[*]}"
  local host_v6_list="${host_ipv6[*]}"
  local match_found=0

  if [[ ${#domain_ipv4[@]} -gt 0 && ${#host_ipv4[@]} -gt 0 ]]; then
    if lists_intersect "$domain_v4_list" "$host_v4_list"; then
      match_found=1
    fi
  fi

  if [[ ${#domain_ipv6[@]} -gt 0 && ${#host_ipv6[@]} -gt 0 ]]; then
    if lists_intersect "$domain_v6_list" "$host_v6_list"; then
      match_found=1
    fi
  fi

  if [[ $match_found -eq 0 ]] && lists_all_loopback "$domain_v4_list" "$domain_v6_list"; then
    die "Domain '$domain' resolves to a loopback address [$(array_join ', ' "${domain_ipv4[@]}" "${domain_ipv6[@]}")] instead of this machine's public IP. This usually means /etc/hosts maps '$domain' to 127.0.1.1, which shadows the public DNS records (check with: getent hosts '$domain'). Remove that name from /etc/hosts, or re-run with --skip-domain-ip-check."
  fi

  if [[ $match_found -eq 0 ]]; then
    die "Domain/IP mismatch for '$domain'. DNS A: [$(array_join ', ' "${domain_ipv4[@]}")] DNS AAAA: [$(array_join ', ' "${domain_ipv6[@]}")] Host IPv4: [$(array_join ', ' "${host_ipv4[@]}")] Host IPv6: [$(array_join ', ' "${host_ipv6[@]}")]"
  fi

  log "Domain/IP verification passed for '$domain'."
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

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --non-interactive)
        GP_NON_INTERACTIVE="1"
        shift
        ;;
      --skip-domain-ip-check)
        GP_SKIP_DOMAIN_IP_CHECK="1"
        shift
        ;;
      --domain)
        GP_DOMAIN="${2:-}"
        shift 2
        ;;
      --admin-username)
        GP_ADMIN_USERNAME="${2:-}"
        shift 2
        ;;
      --admin-password)
        GP_ADMIN_PASSWORD="${2:-}"
        shift 2
        ;;
      --letsencrypt-email)
        GP_LETSENCRYPT_EMAIL="${2:-}"
        shift 2
        ;;
      --app-user)
        GP_APP_USER="${2:-}"
        shift 2
        ;;
      --app-root)
        GP_APP_ROOT="${2:-}"
        shift 2
        ;;
      --db-api-base-url)
        GP_DB_API_BASE_URL="${2:-}"
        shift 2
        ;;
      --telemetry-enabled)
        GP_TELEMETRY_ENABLED="1"
        shift
        ;;
      --telemetry-disabled)
        GP_TELEMETRY_ENABLED="0"
        shift
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done
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

prompt_required() {
  local current="$1"
  local prompt="$2"

  if [[ -n "$current" ]]; then
    printf '%s' "$current"
    return
  fi

  if is_true "${GP_NON_INTERACTIVE:-0}"; then
    die "Missing required value for: $prompt"
  fi

  local value=""
  while [[ -z "$value" ]]; do
    read -r -p "$prompt: " value
  done
  printf '%s' "$value"
}

prompt_optional() {
  local current="$1"
  local prompt="$2"
  local default_value="$3"

  if [[ -n "$current" ]]; then
    printf '%s' "$current"
    return
  fi

  if is_true "${GP_NON_INTERACTIVE:-0}"; then
    printf '%s' "$default_value"
    return
  fi

  local value=""
  read -r -p "$prompt [$default_value]: " value
  if [[ -z "$value" ]]; then
    printf '%s' "$default_value"
  else
    printf '%s' "$value"
  fi
}

prompt_secret_required() {
  local current="$1"
  local prompt="$2"

  if [[ -n "$current" ]]; then
    REPLY="$current"
    return
  fi

  if is_true "${GP_NON_INTERACTIVE:-0}"; then
    die "Missing required secret: $prompt"
  fi

  local value1=""
  local value2=""
  while true; do
    read -r -s -p "$prompt: " value1
    printf '\n' >&2
    read -r -s -p "Confirm $prompt: " value2
    printf '\n' >&2
    [[ -n "$value1" ]] || { warn "Value cannot be empty."; continue; }
    [[ "$value1" == "$value2" ]] || { warn "Values do not match."; continue; }
    REPLY="$value1"
    return
  done
}

create_runtime_dirs() {
  install -d -m 0755 -o root -g "$APP_GROUP" "$APP_ROOT"
  install -d -m 0755 -o root -g "$APP_GROUP" "$APP_SOURCE_DIR"
  install -d -m 0755 -o root -g "$APP_GROUP" "$DEPLOY_DIR"
  install -d -m 0755 -o root -g "$APP_GROUP" "$DATA_DIR"
  install -d -m 0755 -o root -g "$APP_GROUP" "$SERVERS_DIR"
}

sync_project_sources() {
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

seed_deploy_migrations_ledger() {
  local migrations_dir="$APP_SOURCE_DIR/deploy/migrations"
  local applied_file="$DATA_DIR/deploy-migrations.applied"
  local migration

  [[ -d "$migrations_dir" ]] || return 0

  if [[ -e "$applied_file" ]]; then
    return
  fi

  : >"$applied_file"
  for migration in "$migrations_dir"/*.sh; do
    [[ -f "$migration" ]] || continue
    basename "$migration" .sh >>"$applied_file"
  done

  chown root:"$APP_GROUP" "$applied_file"
  chmod 0644 "$applied_file"
}

write_env_file() {
  local jwt_secret="$1"
  local instance_id="$2"
  local instance_secret="$3"
  local telemetry_enabled="$4"

  cat >"$ENV_FILE" <<EOF
PORT=3001
DOMAIN=$(escape_env_value "$DOMAIN")
LETSENCRYPT_EMAIL=$(escape_env_value "$LETSENCRYPT_EMAIL")
JWT_SECRET=$(escape_env_value "$jwt_secret")
ADMIN_USERNAME=$(escape_env_value "$ADMIN_USERNAME")
ADMIN_PASSWORD=$(escape_env_value "$ADMIN_PASSWORD")
GAMEPANEL_APP_ROOT=$(escape_env_value "$APP_ROOT")
GAMEPANEL_REPOSITORY_URL=https://github.com/ovh/game-panel.git
DOCKER_SOCKET=/var/run/docker.sock
TRUST_PROXY=$(escape_env_value "1")
APP_INSTANCE_ID=$(escape_env_value "$instance_id")
APP_INSTANCE_SECRET=$(escape_env_value "$instance_secret")
TELEMETRY_ENABLED=$(escape_env_value "$telemetry_enabled")
TELEMETRY_API_BASE_URL=$(escape_env_value "$DB_API_BASE_URL")
VITE_DB_API_BASE_URL=$(escape_env_value "$DB_API_BASE_URL")
COMPOSE_PROJECT_NAME=$(escape_env_value "$COMPOSE_PROJECT_NAME")
EOF

  chown root:"$APP_GROUP" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
}

write_compose_file() {
  GP_COMPOSE_FILE="$COMPOSE_FILE" \
  GP_APP_GROUP="$APP_GROUP" \
  GP_TRAEFIK_IMAGE="$TRAEFIK_IMAGE" \
    bash "$SCRIPT_DIR/lib/render-compose.sh"
}

send_installed_instance() {
  local payload=""
  local response_file=""
  local status_code=""

  if ! is_true "${TELEMETRY_ENABLED:-1}"; then
    warn "Telemetry disabled; skipping panel.installed telemetry."
    return
  fi

  if ! command -v curl >/dev/null 2>&1; then
    warn "curl is not available; skipping panel.installed telemetry."
    return
  fi

  payload="$(cat <<EOF
{"instanceId":$(escape_env_value "$APP_INSTANCE_ID"),"instanceSecret":$(escape_env_value "$APP_INSTANCE_SECRET"),"version":$(escape_env_value "$APP_VERSION"),"domain":$(escape_env_value "$DOMAIN")}
EOF
)"
  response_file="$(mktemp)"

  status_code="$(
    curl -sS \
      -o "$response_file" \
      -w '%{http_code}' \
      --max-time 10 \
      -H 'Content-Type: application/json' \
      -d "$payload" \
      "${DB_API_BASE_URL%/}/ingest/instances/installed" || true
  )"

  case "$status_code" in
    429)
      warn "Central database rate-limited panel.installed telemetry; skipping instance registration."
      ;;
    409)
      warn "Central database rejected panel.installed telemetry because the instance id already exists."
      ;;
    000|"")
      warn "Central database is unreachable right now; skipping panel.installed telemetry."
      ;;
    *)
      warn "Central database returned HTTP ${status_code} for panel.installed telemetry."
      ;;
  esac

  rm -f "$response_file"
}

wait_for_panel_http() {
  local timeout_seconds="${1:-90}"
  local interval=3
  local elapsed=0
  local code=""

  while [[ "$elapsed" -lt "$timeout_seconds" ]]; do
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 \
      -H "Host: ${DOMAIN}" "https://127.0.0.1/api/health" 2>/dev/null || true)"

    if [[ "$code" == "200" ]]; then
      return 0
    fi

    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  warn "The panel did not answer through Traefik (last HTTP status: ${code:-none})."
  return 1
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
      wait_for_panel_http 90 || return 1
      return 0
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
  setup_install_logging
  require_cmd systemctl
  LOCAL_SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  require_local_source_tree "$LOCAL_SOURCE_ROOT"

  APP_ROOT="${GP_APP_ROOT:-/opt/gamepanel}"
  APP_GROUP="${GP_APP_GROUP:-gamepanel}"
  APP_USER="${GP_APP_USER:-gamepanel}"
  COMPOSE_PROJECT_NAME="${GP_COMPOSE_PROJECT_NAME:-gamepanel}"
  DB_API_BASE_URL="${GP_DB_API_BASE_URL:-https://db.gamepanel.ovh/}"
  TRAEFIK_IMAGE="$(resolve_traefik_image)"

  APP_SOURCE_DIR="${APP_ROOT}/app"
  DEPLOY_DIR="${APP_ROOT}/deploy"
  DATA_DIR="${APP_ROOT}/data"
  SERVERS_DIR="${APP_ROOT}/servers"
  ENV_FILE="${DEPLOY_DIR}/.env"
  COMPOSE_FILE="${DEPLOY_DIR}/compose.yml"

  DOMAIN="$(prompt_required "${GP_DOMAIN:-}" 'Domain (example: panel.example.com)')"
  ADMIN_USERNAME="$(prompt_optional "${GP_ADMIN_USERNAME:-}" 'Admin username' 'admin')"
  prompt_secret_required "${GP_ADMIN_PASSWORD:-}" 'Admin password'
  ADMIN_PASSWORD="$REPLY"
  LETSENCRYPT_EMAIL="$(prompt_required "${GP_LETSENCRYPT_EMAIL:-}" "Let's Encrypt email")"

  log "Installing system dependencies..."
  install_base_packages

  verify_domain_points_to_machine "$DOMAIN"

  log "Using local source tree from $LOCAL_SOURCE_ROOT."
  SOURCE_ROOT="$LOCAL_SOURCE_ROOT"
  assert_app_versions_match "$SOURCE_ROOT"
  APP_VERSION="$(read_app_version "$SOURCE_ROOT")"

  log "Installing Docker and Compose..."
  ensure_docker_stack

  getent group "$APP_GROUP" >/dev/null 2>&1 || groupadd --system "$APP_GROUP"
  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash --gid "$APP_GROUP" "$APP_USER"
  fi
  usermod -aG docker "$APP_USER" || true

  create_runtime_dirs
  sync_project_sources
  seed_deploy_migrations_ledger

  JWT_SECRET="${GP_JWT_SECRET:-$(generate_secret)}"
  APP_INSTANCE_ID="${GP_APP_INSTANCE_ID:-$(generate_uuid)}"
  APP_INSTANCE_SECRET="${GP_APP_INSTANCE_SECRET:-$(generate_secret)}"
  if is_true "${GP_TELEMETRY_ENABLED:-1}"; then
    TELEMETRY_ENABLED="true"
  else
    TELEMETRY_ENABLED="false"
  fi
  write_env_file "$JWT_SECRET" "$APP_INSTANCE_ID" "$APP_INSTANCE_SECRET" "$TELEMETRY_ENABLED"
  write_compose_file

  log "Pulling updater image..."
  updater_image="ovhcom/gamepanel-updater:${APP_VERSION}"
  if docker pull "$updater_image"; then
    log "Updater image is available: $updater_image"
  else
    warn "Unable to pull updater image now: $updater_image"
  fi

  log "Starting GamePanel stack..."
  compose_cmd up -d --build
  local stack_ready="true"
  wait_for_stack || stack_ready="false"
  send_installed_instance

  printf '\n'
  if [[ "$stack_ready" == "true" ]]; then
    log "Installation complete."
  else
    warn "Installation finished, but the panel did not answer yet."
    warn "Check the backend logs: docker logs ${COMPOSE_PROJECT_NAME}-backend-1"
  fi
  printf 'URL: https://%s\n' "$DOMAIN"
  printf 'Admin username: %s\n' "$ADMIN_USERNAME"
  printf 'Compose file: %s\n' "$COMPOSE_FILE"
  printf 'Environment file: %s\n' "$ENV_FILE"
}

main "$@"
