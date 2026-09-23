#!/usr/bin/env bash
# Renders the Game Panel compose file and guarantees its prerequisites.
#
# The compose file holds no installation-specific value - everything variable
# lives in the .env file next to it - so it is regenerated rather than patched in
# place. Callers: install.sh, update.sh, the updater runner and deploy
# migrations. Because every caller runs it right before "compose up", it also
# creates the external games network, which compose is not allowed to manage.
#
# It also backfills the .env keys the template expands: the template is the only
# declaration of what the stack needs, so the guarantee lives next to it instead
# of being repeated by each caller.
#
# Inputs (env):
#   GP_COMPOSE_FILE   required, the compose file to write
#   GP_ENV_FILE       optional, defaults to the .env file next to the compose file
#   GP_APP_ROOT       optional, defaults to the parent of the compose file directory
#   GP_APP_GROUP      optional, defaults to the current file group or "gamepanel"
#   GP_EDGE_NETWORK   optional, defaults to "gamepanel-edge"
#   GP_GAMES_NETWORK  optional, defaults to "gamepanel-games"
#   GP_TRAEFIK_IMAGE  optional, see resolve_traefik_image
set -euo pipefail

RENDER_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
. "$RENDER_LIB_DIR/common.sh"

COMPOSE_FILE="${GP_COMPOSE_FILE:-}"
[[ -n "$COMPOSE_FILE" ]] || die "render-compose: GP_COMPOSE_FILE is not set."
[[ -d "$(dirname "$COMPOSE_FILE")" ]] || die "render-compose: missing directory for $COMPOSE_FILE"

DEPLOY_DIR="$(dirname "$COMPOSE_FILE")"
ENV_FILE="${GP_ENV_FILE:-$DEPLOY_DIR/.env}"
APP_ROOT="${GP_APP_ROOT:-$(dirname "$DEPLOY_DIR")}"
EDGE_NETWORK="${GP_EDGE_NETWORK:-gamepanel-edge}"
GAMES_NETWORK="${GP_GAMES_NETWORK:-gamepanel-games}"
TRAEFIK_IMAGE="$(resolve_traefik_image)"

if [[ -n "${GP_APP_GROUP:-}" ]]; then
  APP_GROUP="$GP_APP_GROUP"
elif [[ -f "$COMPOSE_FILE" ]]; then
  APP_GROUP="$(stat -c '%g' "$COMPOSE_FILE" 2>/dev/null || printf 'gamepanel')"
else
  APP_GROUP="gamepanel"
fi

ensure_env_defaults() {
  local telemetry_api_base_url=""

  if [[ ! -f "$ENV_FILE" ]]; then
    warn "No env file at $ENV_FILE; rendering the compose file without checking its variables."
    return
  fi

  telemetry_api_base_url="$(env_file_read_value "$ENV_FILE" 'VITE_DB_API_BASE_URL')"
  if [[ -z "$telemetry_api_base_url" ]]; then
    telemetry_api_base_url="https://db.gamepanel.ovh/"
  fi

  env_file_append_if_missing "$ENV_FILE" 'APP_INSTANCE_ID' "$(generate_uuid)"
  env_file_append_if_missing "$ENV_FILE" 'APP_INSTANCE_SECRET' "$(generate_secret)"
  env_file_append_if_missing "$ENV_FILE" 'TRUST_PROXY' "1"
  env_file_append_if_missing "$ENV_FILE" 'TELEMETRY_ENABLED' "true"
  env_file_append_if_missing "$ENV_FILE" 'TELEMETRY_API_BASE_URL' "$telemetry_api_base_url"
  env_file_append_if_missing "$ENV_FILE" 'GAMEPANEL_APP_ROOT' "$APP_ROOT"
  env_file_append_if_missing "$ENV_FILE" 'GAMEPANEL_REPOSITORY_URL' \
    "${GP_UPDATE_REPO_URL:-https://github.com/ovh/game-panel.git}"
}

ensure_games_network() {
  if docker network inspect "$GAMES_NETWORK" >/dev/null 2>&1; then
    return
  fi

  log "Creating Docker network $GAMES_NETWORK..."
  docker network create --label gamepanel.managed=true "$GAMES_NETWORK" >/dev/null
}

render_compose_file() {
  local tmp_file=""
  tmp_file="$(mktemp "${COMPOSE_FILE}.XXXXXX")"

  cat >"$tmp_file" <<'COMPOSE_TEMPLATE'
# GENERATED FILE - do not edit.
# Rewritten by deploy/lib/render-compose.sh on every install and update.
# Customise the installation through the .env file next to this one.
services:
  traefik:
    image: __TRAEFIK_IMAGE__
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=__EDGE_NETWORK__"
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
      - edge
    restart: unless-stopped

  backend:
    build:
      context: ../app
      dockerfile: backend/Dockerfile
    environment:
      NODE_ENV: production
      PORT: "${PORT}"
      DOMAIN: "${DOMAIN}"
      JWT_SECRET: "${JWT_SECRET}"
      ADMIN_USERNAME: "${ADMIN_USERNAME}"
      ADMIN_PASSWORD: "${ADMIN_PASSWORD}"
      GAMEPANEL_APP_ROOT: "${GAMEPANEL_APP_ROOT}"
      GAMEPANEL_REPOSITORY_URL: "${GAMEPANEL_REPOSITORY_URL}"
      DOCKER_SOCKET: "${DOCKER_SOCKET}"
      COMPOSE_PROJECT_NAME: "${COMPOSE_PROJECT_NAME}"
      GAMEPANEL_GAMES_NETWORK: "__GAMES_NETWORK__"
      TRUST_PROXY: "${TRUST_PROXY}"
      APP_INSTANCE_ID: "${APP_INSTANCE_ID}"
      APP_INSTANCE_SECRET: "${APP_INSTANCE_SECRET}"
      TELEMETRY_ENABLED: "${TELEMETRY_ENABLED}"
      TELEMETRY_API_BASE_URL: "${TELEMETRY_API_BASE_URL}"
    volumes:
      - "../data:/data"
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "../servers:${GAMEPANEL_APP_ROOT}/servers"
    networks:
      - edge
      - games
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
        VITE_DB_API_BASE_URL: "${VITE_DB_API_BASE_URL}"
    networks:
      - edge
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gamepanel_front.rule=Host(`${DOMAIN}`)"
      - "traefik.http.routers.gamepanel_front.entrypoints=websecure"
      - "traefik.http.routers.gamepanel_front.tls=true"
      - "traefik.http.routers.gamepanel_front.tls.certresolver=le"
      - "traefik.http.services.gamepanel_front.loadbalancer.server.port=8080"

networks:
  edge:
    name: __EDGE_NETWORK__
  games:
    external: true
    name: __GAMES_NETWORK__

volumes:
  letsencrypt:
COMPOSE_TEMPLATE

  sed -i \
    -e "s#__TRAEFIK_IMAGE__#${TRAEFIK_IMAGE}#g" \
    -e "s#__EDGE_NETWORK__#${EDGE_NETWORK}#g" \
    -e "s#__GAMES_NETWORK__#${GAMES_NETWORK}#g" \
    "$tmp_file"

  chown "root:${APP_GROUP}" "$tmp_file" 2>/dev/null || warn "Could not set the ${APP_GROUP} group on the compose file."
  chmod 0644 "$tmp_file"

  mv -f "$tmp_file" "$COMPOSE_FILE"
}

ensure_env_defaults
ensure_games_network
render_compose_file
log "Compose file rendered: $COMPOSE_FILE"
