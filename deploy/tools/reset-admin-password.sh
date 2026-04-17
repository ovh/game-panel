#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
. "$SCRIPT_DIR/../lib/common.sh"

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

escape_env_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local escaped_value=""
  local tmp_file=""

  escaped_value="$(escape_env_value "$value")"
  tmp_file="$(mktemp)"

  awk -v key="$key" -v value="$escaped_value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 {
      if (updated == 0) {
        print key "=" value
        updated = 1
      }
      next
    }
    { print }
    END {
      if (updated == 0) {
        print key "=" value
      }
    }
  ' "$ENV_FILE" >"$tmp_file"

  cat "$tmp_file" >"$ENV_FILE"
  rm -f "$tmp_file"
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

prompt_new_password() {
  local password1=""
  local password2=""

  while true; do
    read -r -s -p "New admin password: " password1
    printf '\n' >&2
    read -r -s -p "Confirm new admin password: " password2
    printf '\n\n' >&2

    [[ -n "$password1" ]] || {
      warn "Password cannot be empty."
      continue
    }

    if [[ ${#password1} -lt 8 ]]; then
      warn "Password must be at least 8 characters."
      continue
    fi

    [[ "$password1" == "$password2" ]] || {
      warn "Passwords do not match."
      continue
    }

    REPLY="$password1"
    return
  done
}

update_root_password_in_database() {
  local password="$1"
  local node_script=""

  node_script="$(cat <<'NODE'
import { userRepository } from './dist/database/index.js';
import { closeDatabase } from './dist/database/init.js';
import { hashPassword } from './dist/utils/auth.js';

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const password = Buffer.concat(chunks).toString('utf8');
if (!password) {
  throw new Error('Empty password input');
}

try {
  const users = await userRepository.list();
  const rootUser = users.find((user) => Number(user.is_root) === 1);

  if (!rootUser) {
    throw new Error('No root user found in the database');
  }

  const passwordHash = await hashPassword(password);
  await userRepository.updatePassword(rootUser.id, passwordHash);

  process.stdout.write(rootUser.username);
} finally {
  await closeDatabase().catch(() => {});
}
NODE
)"

  printf '%s' "$password" | compose_cmd run --rm --no-deps -T backend \
    node --input-type=module -e "$node_script"
}

wait_for_backend() {
  local max_attempts=30
  local sleep_seconds=2
  local container_id=""

  for ((i=1; i<=max_attempts; i++)); do
    container_id="$(docker ps -q \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=backend")"

    if [[ -n "$container_id" ]]; then
      return
    fi

    sleep "$sleep_seconds"
  done

  die "Backend did not become ready in time."
}

main() {
  local new_password=""
  local root_username=""
  local new_jwt_secret=""

  ensure_linux
  parse_args "$@"
  ensure_root "$@"
  require_cmd docker

  APP_ROOT="${GP_APP_ROOT:-/opt/gamepanel}"
  COMPOSE_PROJECT_NAME="${GP_COMPOSE_PROJECT_NAME:-gamepanel}"

  APP_SOURCE_DIR="${APP_ROOT}/app"
  DEPLOY_DIR="${APP_ROOT}/deploy"
  ENV_FILE="${DEPLOY_DIR}/.env"
  COMPOSE_FILE="${DEPLOY_DIR}/compose.yml"

  [[ -d "$APP_SOURCE_DIR/backend" ]] || die "Missing backend source directory: $APP_SOURCE_DIR/backend"
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"

  prompt_new_password
  new_password="$REPLY"

  log "Updating the root user password in the database..."
  root_username="$(update_root_password_in_database "$new_password")"
  [[ -n "$root_username" ]] || die "Failed to resolve the updated root username."

  new_jwt_secret="$(generate_secret)"

  log "Rotating JWT secret..."
  set_env_value "JWT_SECRET" "$new_jwt_secret"

  log "Recreating the backend to invalidate existing sessions..."
  compose_cmd up -d --no-deps --force-recreate backend
  wait_for_backend

  printf '\n'
  log "Admin password reset complete for user: $root_username"
  printf 'Reconnect to the application with the new admin password.\n'
}

main "$@"
