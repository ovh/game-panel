#!/bin/sh

LOG_PREFIX="${LOG_PREFIX:-[app]}"

log() {
  printf '%s %s\n' "${LOG_PREFIX}" "$*"
}

die() {
  printf '%s ERROR: %s\n' "${LOG_PREFIX}" "$*" >&2
  exit 1
}

is_truthy() {
  case "$1" in
    1|[Tt][Rr][Uu][Ee]|[Yy]|[Yy][Ee][Ss]|[Oo][Nn])
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

assert_safe_data_dir() {
  case "${DATA_DIR:-}" in
    ""|"/")
      die "Refusing to operate on unsafe DATA_DIR='${DATA_DIR:-}'."
      ;;
  esac
}

assert_writable_dir() {
  TARGET_DIR="$1"
  TEST_FILE="${TARGET_DIR}/.writable-check-$$"

  if ! mkdir -p "${TARGET_DIR}" 2>/dev/null; then
    die "Directory '${TARGET_DIR}' cannot be created or accessed by user '$(id -un)' (uid=$(id -u), gid=$(id -g))."
  fi

  if ! : > "${TEST_FILE}" 2>/dev/null; then
    die "Directory '${TARGET_DIR}' is not writable by user '$(id -un)' (uid=$(id -u), gid=$(id -g))."
  fi

  rm -f "${TEST_FILE}"
}

palworld_pid_file_path() {
  printf '%s/server.pid\n' "${RUNTIME_DIR:-/run/palworld}"
}

read_palworld_pid() {
  PALWORLD_PID_FILE="$(palworld_pid_file_path)"

  [ -f "${PALWORLD_PID_FILE}" ] || return 1

  PALWORLD_PID="$(cat "${PALWORLD_PID_FILE}" 2>/dev/null || true)"
  case "${PALWORLD_PID}" in
    ""|*[!0-9]*)
      return 1
      ;;
  esac

  printf '%s\n' "${PALWORLD_PID}"
}

is_palworld_server_running() {
  RUNNING_PID="$(read_palworld_pid)" || return 1
  kill -0 "${RUNNING_PID}" 2>/dev/null
}

assert_palworld_server_stopped() {
  if RUNNING_PID="$(read_palworld_pid)" && kill -0 "${RUNNING_PID}" 2>/dev/null; then
    die "Palworld server is still running with PID ${RUNNING_PID}. Stop the server before running this operation."
  fi
}

gameserver_meta_file() {
  printf '%s\n' "${GAMESERVER_META_FILE:-${DATA_DIR:-/data}/.gameserver-meta.json}"
}

server_binary_relative_to_data() {
  case "${PALWORLD_SERVER_BIN:-}" in
    "${DATA_DIR:-/data}"/*)
      printf '%s\n' "${PALWORLD_SERVER_BIN#${DATA_DIR}/}"
      ;;
    *)
      return 1
      ;;
  esac
}

write_gameserver_metadata() {
  META_FILE="$(gameserver_meta_file)"
  META_DIR="$(dirname "${META_FILE}")"
  ARTIFACT_PATH="$(server_binary_relative_to_data || printf '%s\n' "${PALWORLD_SERVER_BIN:-}")"

  mkdir -p "${META_DIR}"
  META_TMP="$(mktemp "${META_DIR}/.gameserver-meta.XXXXXX")"

  jq -n \
    --arg serverType "${GAMESERVER_SERVER_TYPE:-palworld}" \
    --arg steamAppId "${PALWORLD_STEAM_APP_ID:-2394010}" \
    --arg installDir "${PALWORLD_INSTALL_DIR:-/data/server}" \
    --arg artifactPath "${ARTIFACT_PATH}" '
      {
        schemaVersion: 1,
        serverType: $serverType,
        steam: {
          appId: (($steamAppId | tonumber?) // $steamAppId)
        },
        install: {
          path: $installDir
        },
        artifact: {
          path: $artifactPath
        }
      }
    ' > "${META_TMP}"

  mv "${META_TMP}" "${META_FILE}"
}

palworld_config_file() {
  printf '%s\n' "${PALWORLD_CONFIG_FILE:-${PALWORLD_INSTALL_DIR:-${DATA_DIR:-/data}/server}/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini}"
}

palworld_admin_password() {
  PALWORLD_API_CONFIG="$(palworld_config_file)"
  [ -f "${PALWORLD_API_CONFIG}" ] || return 1
  sed -n 's/.*[(,]AdminPassword="\([^"]*\)".*/\1/p' "${PALWORLD_API_CONFIG}" | head -n 1
}

palworld_rest_port() {
  PALWORLD_API_CONFIG="$(palworld_config_file)"
  PALWORLD_API_PORT=""
  if [ -f "${PALWORLD_API_CONFIG}" ]; then
    PALWORLD_API_PORT="$(sed -n 's/.*[(,]RESTAPIPort=\([0-9][0-9]*\).*/\1/p' "${PALWORLD_API_CONFIG}" | head -n 1)"
  fi
  printf '%s\n' "${PALWORLD_API_PORT:-8212}"
}

palworld_api() {
  API_METHOD="$1"
  API_PATH="$2"
  API_BODY="${3:-}"

  API_PASSWORD="$(palworld_admin_password || true)"
  if [ -z "${API_PASSWORD}" ]; then
    die "Could not read a REST API admin password from $(palworld_config_file)."
  fi

  API_URL="http://127.0.0.1:$(palworld_rest_port)/v1/api/${API_PATH}"

  if [ -n "${API_BODY}" ]; then
    curl -fsS -u "admin:${API_PASSWORD}" -X "${API_METHOD}" \
      -H "Content-Type: application/json" \
      --data "${API_BODY}" \
      "${API_URL}" \
      || die "REST API call failed: ${API_METHOD} /v1/api/${API_PATH}"
  else
    curl -fsS -u "admin:${API_PASSWORD}" -X "${API_METHOD}" \
      -H "Content-Length: 0" \
      "${API_URL}" \
      || die "REST API call failed: ${API_METHOD} /v1/api/${API_PATH}"
  fi
}
