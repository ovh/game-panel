#!/usr/bin/env bash

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
}

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_linux() {
  [[ "$(uname -s)" == "Linux" ]] || die "This script supports Linux only."
}

ensure_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    log "Re-running script with sudo..."
    exec sudo -E bash "$0" "$@"
  fi

  die "Run this script as root (or install sudo)."
}

canonical_path() {
  local path="$1"
  if [[ -d "$path" ]]; then
    (cd "$path" && pwd -P)
  else
    printf '%s' "$path"
  fi
}

resolve_traefik_image() {
  printf '%s' "${GP_TRAEFIK_IMAGE:-traefik:v3.6.10}"
}

detect_os_release() {
  [[ -r /etc/os-release ]] || die "Missing /etc/os-release; unsupported Linux distribution."

  # shellcheck disable=SC1091
  . /etc/os-release

  DISTRO_ID="${ID:-}"
  DISTRO_VERSION_ID="${VERSION_ID:-}"
  DISTRO_CODENAME="${VERSION_CODENAME:-}"
  DISTRO_PRETTY_NAME="${PRETTY_NAME:-${DISTRO_ID:-unknown}}"

  [[ -n "$DISTRO_ID" ]] || die "Could not determine Linux distribution ID."
  [[ -n "$DISTRO_VERSION_ID" ]] || die "Could not determine Linux distribution version."
}

require_supported_platform() {
  detect_os_release

  case "${DISTRO_ID}:${DISTRO_VERSION_ID}" in
    debian:12|debian:13|ubuntu:24.04)
      ;;
    *)
      die "Unsupported distribution: ${DISTRO_PRETTY_NAME}. Supported: Debian 12, Debian 13, Ubuntu 24.04."
      ;;
  esac

  [[ -n "$DISTRO_CODENAME" ]] || die "Could not determine distribution codename for ${DISTRO_PRETTY_NAME}."
}

apt_install() {
  require_cmd apt-get
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y "$@"
}

install_base_packages() {
  require_supported_platform
  apt_install \
    acl \
    ca-certificates \
    curl \
    git \
    gnupg \
    openssh-server \
    openssl \
    tar
}

remove_legacy_docker_packages() {
  local pkg

  require_cmd apt-get
  require_cmd dpkg-query

  for pkg in \
    docker-cli \
    docker.io \
    docker-doc \
    docker-buildx \
    docker-compose \
    docker-compose-v2 \
    podman-docker \
    containerd \
    runc
  do
    if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
      apt-get remove -y "$pkg"
    fi
  done
}

configure_docker_apt_repo() {
  local repo_file="/etc/apt/sources.list.d/docker.list"
  local keyring_file="/etc/apt/keyrings/docker.asc"
  local arch
  local repo_line

  require_supported_platform
  apt_install ca-certificates curl
  require_cmd curl
  require_cmd dpkg

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${DISTRO_ID}/gpg" -o "$keyring_file"
  chmod a+r "$keyring_file"

  arch="$(dpkg --print-architecture)"
  repo_line="deb [arch=${arch} signed-by=${keyring_file}] https://download.docker.com/linux/${DISTRO_ID} ${DISTRO_CODENAME} stable"

  if [[ ! -f "$repo_file" ]] || [[ "$(tr -d '\r' < "$repo_file")" != "$repo_line" ]]; then
    printf '%s\n' "$repo_line" > "$repo_file"
  fi

  apt-get update -y
}

docker_service_exists() {
  systemctl list-unit-files --type=service --all 2>/dev/null \
    | awk '{print $1}' \
    | grep -qx 'docker.service'
}

docker_stack_ready() {
  command -v docker >/dev/null 2>&1 || return 1

  docker compose version >/dev/null 2>&1 || return 1

  docker_service_exists
}

install_docker_stack() {
  require_supported_platform
  require_cmd systemctl

  log "Configuring Docker official repository for ${DISTRO_PRETTY_NAME}..."
  configure_docker_apt_repo

  log "Installing Docker Engine, Buildx and Compose plugin..."
  remove_legacy_docker_packages
  apt_install \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  systemctl enable --now docker

  command -v docker >/dev/null 2>&1 || die "Docker installation failed."
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin installation failed."
}

ensure_docker_stack() {
  require_cmd systemctl

  if docker_stack_ready; then
    log "Docker and Compose are already available."
    if systemctl enable --now docker && docker info >/dev/null 2>&1; then
      return
    fi

    warn "Existing Docker installation is incomplete or not operational. Reinstalling Docker stack..."
  fi

  install_docker_stack
}

ensure_compose_traefik_image() {
  local compose_file="$1"
  local desired_image current_image tmp_file

  [[ -f "$compose_file" ]] || die "Missing compose file: $compose_file"

  desired_image="$(resolve_traefik_image)"
  current_image="$(awk '
    /^[[:space:]]*traefik:[[:space:]]*$/ { in_traefik=1; next }
    in_traefik && /^[[:space:]]*image:[[:space:]]*/ {
      sub(/^[[:space:]]*image:[[:space:]]*/, "", $0)
      print
      exit
    }
    in_traefik && /^[[:space:]]*[A-Za-z0-9_-]+:[[:space:]]*$/ && $0 !~ /^[[:space:]]*image:/ {
      next
    }
    in_traefik && /^[^[:space:]]/ {
      in_traefik=0
    }
  ' "$compose_file")"

  if [[ -z "$current_image" ]]; then
    warn "Could not detect Traefik image in $compose_file; skipping Traefik image migration."
    return
  fi

  if [[ "$current_image" == "$desired_image" ]]; then
    return
  fi

  tmp_file="$(mktemp)"
  awk -v desired_image="$desired_image" '
    /^[[:space:]]*traefik:[[:space:]]*$/ {
      in_traefik=1
      print
      next
    }
    in_traefik && /^[[:space:]]*image:[[:space:]]*/ {
      sub(/image:[[:space:]].*/, "image: " desired_image)
      print
      in_traefik=0
      next
    }
    in_traefik && /^[^[:space:]]/ {
      in_traefik=0
    }
    { print }
  ' "$compose_file" > "$tmp_file"

  cat "$tmp_file" > "$compose_file"
  rm -f "$tmp_file"

  log "Updated Traefik image in $compose_file to ${desired_image}."
}
