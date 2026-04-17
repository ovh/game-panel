#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

DEFAULT_GITHUB_REPO_URL="https://github.com/ovh/game-panel.git"
DEFAULT_GITHUB_REPO_BRANCH="main"

escape_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

json_string_or_null() {
  local value="$1"
  if [[ -z "$value" ]]; then
    printf 'null'
    return
  fi

  escape_env_value "$value"
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
    getent ahostsv6 "$domain" 2>/dev/null | awk '{print $1}'
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

  if [[ $match_found -eq 0 ]]; then
    die "Domain/IP mismatch for '$domain'. DNS A: [$(array_join ', ' "${domain_ipv4[@]}")] DNS AAAA: [$(array_join ', ' "${domain_ipv6[@]}")] Host IPv4: [$(array_join ', ' "${host_ipv4[@]}")] Host IPv6: [$(array_join ', ' "${host_ipv6[@]}")]"
  fi

  log "Domain/IP verification passed for '$domain'."
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
        "GitHub fetch is disabled by GP_ENABLE_GITHUB_FETCH=0. Use '--local' to install from local sources."

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
      --non-interactive)
        GP_NON_INTERACTIVE="1"
        shift
        ;;
      --skip-domain-ip-check)
        GP_SKIP_DOMAIN_IP_CHECK="1"
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

detect_primary_host_ip() {
  local candidate=""

  while read -r candidate; do
    if is_valid_ipv4 "$candidate" || is_valid_ipv6 "$candidate"; then
      printf '%s' "$candidate"
      return
    fi
  done < <(
    {
      detect_host_ipv4_candidates
      detect_host_ipv6_candidates
    } | unique_lines
  )
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

install_host_agent() {
  local source_agent="$APP_SOURCE_DIR/deploy/assets/host-agent/gamepanel-host-agent"
  local source_service="$APP_SOURCE_DIR/deploy/assets/host-agent/gamepanel-host-agent.service"

  [[ -f "$source_agent" ]] || die "Missing host-agent file: $source_agent"
  [[ -f "$source_service" ]] || die "Missing host-agent service file: $source_service"

  install -D -m 0755 "$source_agent" /usr/local/sbin/gamepanel-host-agent
  install -D -m 0644 "$source_service" /etc/systemd/system/gamepanel-host-agent.service

  systemctl daemon-reload
  systemctl enable --now gamepanel-host-agent
}

reload_ssh_service() {
  if systemctl list-unit-files | awk '{print $1}' | grep -qx 'ssh.service'; then
    systemctl reload ssh
    return
  fi

  if systemctl list-unit-files | awk '{print $1}' | grep -qx 'sshd.service'; then
    systemctl reload sshd
    return
  fi

  warn "Could not detect ssh/sshd service to reload. Reload SSH manually if needed."
}

install_sshd_match_config() {
  local source_sshd_cfg="$APP_SOURCE_DIR/deploy/assets/sshd/gamepanel-sftp.conf"
  [[ -f "$source_sshd_cfg" ]] || die "Missing SSHD config file: $source_sshd_cfg"

  install -D -m 0644 "$source_sshd_cfg" /etc/ssh/sshd_config.d/gamepanel-sftp.conf
  require_cmd sshd
  sshd -t
  reload_ssh_service
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
FRONTEND_URL=$(escape_env_value "https://$DOMAIN")
ADMIN_USERNAME=$(escape_env_value "$ADMIN_USERNAME")
ADMIN_PASSWORD=$(escape_env_value "$ADMIN_PASSWORD")
GAMEPANEL_DB_DIR=/data
GAMEPANEL_SERVERS_DIR=/opt/gamepanel/servers
DOCKER_SOCKET=/var/run/docker.sock
TRUST_PROXY=$(escape_env_value "1")
APP_USER=$(escape_env_value "$APP_USER")
HOST_AGENT_SOCKET=/run/gamepanel/host-agent.sock
APP_INSTANCE_ID=$(escape_env_value "$instance_id")
APP_INSTANCE_SECRET=$(escape_env_value "$instance_secret")
TELEMETRY_ENABLED=$(escape_env_value "$telemetry_enabled")
TELEMETRY_API_BASE_URL=$(escape_env_value "$DB_API_BASE_URL")
VITE_API_BASE_URL=$(escape_env_value "https://$DOMAIN")
VITE_DB_API_BASE_URL=$(escape_env_value "$DB_API_BASE_URL")
VITE_WS_URL=$(escape_env_value "wss://$DOMAIN/api")
COMPOSE_PROJECT_NAME=$(escape_env_value "$COMPOSE_PROJECT_NAME")
EOF

  chown root:"$APP_GROUP" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
}

write_compose_file() {
  cat >"$COMPOSE_FILE" <<'EOF'
services:
  traefik:
    image: __TRAEFIK_IMAGE__
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.email=${LETSENCRYPT_EMAIL}"
      - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.le.acme.httpchallenge=true"
      - "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"
      - "--log.level=INFO"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "letsencrypt:/letsencrypt"
    networks:
      - web
    restart: unless-stopped

  backend:
    build:
      context: ../app
      dockerfile: backend/Dockerfile
    environment:
      NODE_ENV: production
      PORT: "${PORT}"
      JWT_SECRET: "${JWT_SECRET}"
      FRONTEND_URL: "${FRONTEND_URL}"
      ADMIN_USERNAME: "${ADMIN_USERNAME}"
      ADMIN_PASSWORD: "${ADMIN_PASSWORD}"
      GAMEPANEL_DB_DIR: "${GAMEPANEL_DB_DIR}"
      GAMEPANEL_SERVERS_DIR: "${GAMEPANEL_SERVERS_DIR}"
      DOCKER_SOCKET: "${DOCKER_SOCKET}"
      TRUST_PROXY: "${TRUST_PROXY}"
      APP_USER: "${APP_USER}"
      HOST_AGENT_SOCKET: "${HOST_AGENT_SOCKET}"
      APP_INSTANCE_ID: "${APP_INSTANCE_ID}"
      APP_INSTANCE_SECRET: "${APP_INSTANCE_SECRET}"
      TELEMETRY_ENABLED: "${TELEMETRY_ENABLED}"
      TELEMETRY_API_BASE_URL: "${TELEMETRY_API_BASE_URL}"
    volumes:
      - "../data:/data"
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "/run/gamepanel:/run/gamepanel"
      - "../servers:/opt/gamepanel/servers"
    networks:
      - web
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gamepanel_api.rule=Host(`${DOMAIN}`) && PathPrefix(`/api`)"
      - "traefik.http.routers.gamepanel_api.entrypoints=websecure"
      - "traefik.http.routers.gamepanel_api.tls=true"
      - "traefik.http.routers.gamepanel_api.tls.certresolver=le"
      - "traefik.http.services.gamepanel_api.loadbalancer.server.port=${PORT}"

  frontend:
    build:
      context: ../app
      dockerfile: frontend/Dockerfile
      args:
        VITE_API_BASE_URL: "${VITE_API_BASE_URL}"
        VITE_DB_API_BASE_URL: "${VITE_DB_API_BASE_URL}"
        VITE_WS_URL: "${VITE_WS_URL}"
    networks:
      - web
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gamepanel_front.rule=Host(`${DOMAIN}`)"
      - "traefik.http.routers.gamepanel_front.entrypoints=websecure"
      - "traefik.http.routers.gamepanel_front.tls=true"
      - "traefik.http.routers.gamepanel_front.tls.certresolver=le"
      - "traefik.http.services.gamepanel_front.loadbalancer.server.port=80"

networks:
  web:

volumes:
  letsencrypt:
EOF
  sed -i "s#__TRAEFIK_IMAGE__#${TRAEFIK_IMAGE}#g" "$COMPOSE_FILE"
  chown root:"$APP_GROUP" "$COMPOSE_FILE"
  chmod 0644 "$COMPOSE_FILE"
}

send_installed_instance() {
  local reported_ip="$1"
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
{"instanceId":$(escape_env_value "$APP_INSTANCE_ID"),"instanceSecret":$(escape_env_value "$APP_INSTANCE_SECRET"),"version":$(escape_env_value "$APP_VERSION"),"domain":$(escape_env_value "$DOMAIN"),"reportedIp":$(json_string_or_null "$reported_ip")}
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

  log "Resolving source mode: ${GP_SOURCE_MODE}"
  SOURCE_ROOT="$(resolve_source_root "$LOCAL_SOURCE_ROOT")"
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

  log "Installing host-agent..."
  install_host_agent

  log "Installing SSH SFTP match config..."
  install_sshd_match_config

  JWT_SECRET="${GP_JWT_SECRET:-$(generate_secret)}"
  APP_INSTANCE_ID="${GP_APP_INSTANCE_ID:-$(generate_uuid)}"
  APP_INSTANCE_SECRET="${GP_APP_INSTANCE_SECRET:-$(generate_secret)}"
  if is_true "${GP_TELEMETRY_ENABLED:-1}"; then
    TELEMETRY_ENABLED="true"
  else
    TELEMETRY_ENABLED="false"
  fi
  local reported_ip=""
  reported_ip="$(detect_primary_host_ip || true)"
  write_env_file "$JWT_SECRET" "$APP_INSTANCE_ID" "$APP_INSTANCE_SECRET" "$TELEMETRY_ENABLED"
  write_compose_file

  log "Starting GamePanel stack..."
  compose_cmd up -d --build
  wait_for_stack
  send_installed_instance "$reported_ip"

  printf '\n'
  log "Installation complete."
  printf 'URL: https://%s\n' "$DOMAIN"
  printf 'Admin username: %s\n' "$ADMIN_USERNAME"
  printf 'Compose file: %s\n' "$COMPOSE_FILE"
  printf 'Environment file: %s\n' "$ENV_FILE"
}

main "$@"
