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

cs2_pid_file_path() {
  printf '%s/server.pid\n' "${RUNTIME_DIR:-/run/counter-strike2}"
}

cs2_fifo_path() {
  printf '%s/stdin.fifo\n' "${RUNTIME_DIR:-/run/counter-strike2}"
}

read_cs2_pid() {
  CS2_PID_FILE="$(cs2_pid_file_path)"

  [ -f "${CS2_PID_FILE}" ] || return 1

  CS2_PID="$(cat "${CS2_PID_FILE}" 2>/dev/null || true)"
  case "${CS2_PID}" in
    ""|*[!0-9]*)
      return 1
      ;;
  esac

  printf '%s\n' "${CS2_PID}"
}

is_cs2_server_running() {
  RUNNING_PID="$(read_cs2_pid)" || return 1
  kill -0 "${RUNNING_PID}" 2>/dev/null
}

gameserver_meta_file() {
  printf '%s\n' "${GAMESERVER_META_FILE:-${DATA_DIR:-/data}/.gameserver-meta.json}"
}

server_binary_relative_to_data() {
  case "${CS2_SERVER_BIN:-}" in
    "${DATA_DIR:-/data}"/*)
      printf '%s\n' "${CS2_SERVER_BIN#${DATA_DIR}/}"
      ;;
    *)
      return 1
      ;;
  esac
}

write_gameserver_metadata() {
  META_FILE="$(gameserver_meta_file)"
  META_DIR="$(dirname "${META_FILE}")"
  ARTIFACT_PATH="$(server_binary_relative_to_data || printf '%s\n' "${CS2_SERVER_BIN:-}")"

  mkdir -p "${META_DIR}"
  META_TMP="$(mktemp "${META_DIR}/.gameserver-meta.XXXXXX")"

  jq -n \
    --arg serverType "${GAMESERVER_SERVER_TYPE:-counter-strike-2}" \
    --arg steamAppId "${CS2_STEAM_APP_ID:-730}" \
    --arg installDir "${CS2_INSTALL_DIR:-/data/server}" \
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

curl_to_stdout() {
  CURL_URL="$1"

  curl -fsSL \
    --retry "${CURL_RETRY_COUNT:-3}" \
    --retry-delay "${CURL_RETRY_DELAY_SECONDS:-2}" \
    --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS:-15}" \
    --max-time "${CURL_MAX_TIME_SECONDS:-300}" \
    "${CURL_URL}"
}

github_api_to_stdout() {
  GITHUB_API_URL="$1"

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      --retry "${CURL_RETRY_COUNT:-3}" \
      --retry-delay "${CURL_RETRY_DELAY_SECONDS:-2}" \
      --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS:-15}" \
      --max-time "${CURL_MAX_TIME_SECONDS:-300}" \
      "${GITHUB_API_URL}"
  else
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      --retry "${CURL_RETRY_COUNT:-3}" \
      --retry-delay "${CURL_RETRY_DELAY_SECONDS:-2}" \
      --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS:-15}" \
      --max-time "${CURL_MAX_TIME_SECONDS:-300}" \
      "${GITHUB_API_URL}"
  fi
}

download_to_file() {
  DOWNLOAD_URL="$1"
  DOWNLOAD_DEST="$2"
  DOWNLOAD_DEST_DIR="$(dirname "${DOWNLOAD_DEST}")"

  mkdir -p "${DOWNLOAD_DEST_DIR}"
  DOWNLOAD_TMP="$(mktemp "${DOWNLOAD_DEST_DIR}/.download.XXXXXX")"

  if ! curl -fsSL \
    --retry "${CURL_RETRY_COUNT:-3}" \
    --retry-delay "${CURL_RETRY_DELAY_SECONDS:-2}" \
    --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS:-15}" \
    --max-time "${CURL_MAX_TIME_SECONDS:-300}" \
    -o "${DOWNLOAD_TMP}" \
    "${DOWNLOAD_URL}"; then
    rm -f "${DOWNLOAD_TMP}"
    return 1
  fi

  mv "${DOWNLOAD_TMP}" "${DOWNLOAD_DEST}"
}

cs2_game_root_dir() {
  printf '%s\n' "${CS2_GAME_ROOT:-${CS2_INSTALL_DIR:-${DATA_DIR:-/data}/server}/game}"
}

cs2_csgo_dir() {
  printf '%s\n' "${CS2_CSGO_DIR:-$(cs2_game_root_dir)/csgo}"
}

cs2_metamod_dir() {
  printf '%s\n' "${CS2_METAMOD_DIR:-$(cs2_csgo_dir)/addons/metamod}"
}

cs2_gameinfo_file() {
  printf '%s/gameinfo.gi\n' "$(cs2_csgo_dir)"
}

frameworks_tmp_dir() {
  printf '%s\n' "${FRAMEWORKS_TMP_DIR:-${RUNTIME_DIR:-/run/counter-strike2}/frameworks}"
}

assert_cs2_install_layout() {
  CS2_GAME_ROOT_DIR="$(cs2_game_root_dir)"
  CS2_CSGO_DIR_RESOLVED="$(cs2_csgo_dir)"
  CS2_GAMEINFO_PATH="$(cs2_gameinfo_file)"

  [ -d "${CS2_GAME_ROOT_DIR}" ] || die "CS2 game root directory not found: ${CS2_GAME_ROOT_DIR}"
  [ -d "${CS2_CSGO_DIR_RESOLVED}" ] || die "CS2 csgo directory not found: ${CS2_CSGO_DIR_RESOLVED}"
  [ -f "${CS2_GAMEINFO_PATH}" ] || die "CS2 gameinfo.gi file not found: ${CS2_GAMEINFO_PATH}"
}

overlay_directory_contents() {
  SOURCE_DIR="$1"
  TARGET_DIR="$2"

  mkdir -p "${TARGET_DIR}"
  cp -a "${SOURCE_DIR}/." "${TARGET_DIR}/"
}

backup_file_once() {
  SOURCE_FILE="$1"
  BACKUP_FILE="$2"

  if [ ! -e "${BACKUP_FILE}" ]; then
    cp -a "${SOURCE_FILE}" "${BACKUP_FILE}"
  fi
}

metamod_gameinfo_mode_normalized() {
  MODE="${1:-${METAMOD_GAMEINFO_MODE:-ensure}}"

  case "${MODE}" in
    ensure|check|skip)
      printf '%s\n' "${MODE}"
      ;;
    *)
      die "Unsupported METAMOD_GAMEINFO_MODE: ${MODE}. Expected one of: ensure, check, skip."
      ;;
  esac
}

metamod_search_path_line() {
  printf '\t\t\tGame\tcsgo/addons/metamod\n'
}

metamod_is_installed() {
  METAMOD_PLUGIN_PATH="$(cs2_csgo_dir)/addons/metamod/bin/linuxsteamrt64/metamod.2.cs2.so"
  [ -f "${METAMOD_PLUGIN_PATH}" ]
}

counterstrikesharp_is_installed() {
  CSS_PLUGIN_PATH="$(cs2_csgo_dir)/addons/counterstrikesharp/bin/linuxsteamrt64/counterstrikesharp.so"
  [ -f "${CSS_PLUGIN_PATH}" ]
}

validate_metamod_gameinfo_entry() {
  GAMEINFO_FILE_PATH="$1"
  METAMOD_LINE="$(metamod_search_path_line)"

  awk -v metamodLine="${METAMOD_LINE}" '
    BEGIN {
      metamod_count = 0
      metamod_exact_count = 0
      first_csgo_seen = 0
      metamod_before_csgo = 0
    }

    {
      line = $0
      sub(/\r$/, "", line)
    }

    line ~ /^[[:space:]]*Game[[:space:]]+csgo\/addons\/metamod([[:space:]]|$)/ {
      metamod_count++
      if (line == metamodLine) {
        metamod_exact_count++
      }
      if (!first_csgo_seen) {
        metamod_before_csgo = 1
      }
    }

    line ~ /^[[:space:]]*Game[[:space:]]+csgo([[:space:]]|$)/ {
      if (!first_csgo_seen) {
        first_csgo_seen = 1
      }
    }

    END {
      exit !(metamod_count == 1 && metamod_before_csgo == 1 && metamod_exact_count == 1)
    }
  ' "${GAMEINFO_FILE_PATH}"
}

ensure_metamod_gameinfo_entry() {
  GAMEINFO_MODE="$(metamod_gameinfo_mode_normalized "${1:-}")"
  GAMEINFO_FILE_PATH="$(cs2_gameinfo_file)"
  GAMEINFO_DIR="$(dirname "${GAMEINFO_FILE_PATH}")"
  GAMEINFO_BACKUP_PATH="${GAMEINFO_FILE_PATH}.gameserver.bak"

  case "${GAMEINFO_MODE}" in
    skip)
      log "Skipping gameinfo.gi reconciliation because METAMOD_GAMEINFO_MODE=skip."
      return 0
      ;;
    check)
      if validate_metamod_gameinfo_entry "${GAMEINFO_FILE_PATH}"; then
        log "Verified Metamod search path entry in gameinfo.gi."
        return 0
      fi

      die "Metamod search path entry is missing, duplicated, or misplaced in ${GAMEINFO_FILE_PATH}."
      ;;
  esac

  if validate_metamod_gameinfo_entry "${GAMEINFO_FILE_PATH}"; then
    log "Metamod search path entry already present in gameinfo.gi."
    return 0
  fi

  backup_file_once "${GAMEINFO_FILE_PATH}" "${GAMEINFO_BACKUP_PATH}"

  GAMEINFO_TMP="$(mktemp "${GAMEINFO_DIR}/.gameinfo.gi.XXXXXX")"
  METAMOD_LINE="$(metamod_search_path_line)"

  if awk -v metamodLine="${METAMOD_LINE}" '
    BEGIN {
      inserted = 0
      recordSeparator = "\n"
    }

    function emit(text) {
      printf "%s%s", text, recordSeparator
    }

    /^[[:space:]]*Game[[:space:]]+csgo\/addons\/metamod([[:space:]]|$)/ {
      next
    }

    {
      line = $0
      if (sub(/\r$/, "", line)) {
        recordSeparator = "\r\n"
      }

      if (!inserted && line ~ /^[[:space:]]*Game_LowViolence[[:space:]]+csgo_lv([[:space:]]|$)/) {
        emit(line)
        emit(metamodLine)
        inserted = 1
        next
      }

      if (!inserted && line ~ /^[[:space:]]*Game[[:space:]]+csgo([[:space:]]|$)/) {
        emit(metamodLine)
        inserted = 1
      }

      emit(line)
    }

    END {
      if (!inserted) {
        exit 42
      }
    }
  ' "${GAMEINFO_FILE_PATH}" > "${GAMEINFO_TMP}"; then
    :
  else
    AWK_RESULT=$?
    rm -f "${GAMEINFO_TMP}"

    if [ "${AWK_RESULT}" -eq 42 ]; then
      die "Could not find a suitable insertion point for Metamod in ${GAMEINFO_FILE_PATH}."
    fi

    die "Failed to rewrite ${GAMEINFO_FILE_PATH}."
  fi

  mv "${GAMEINFO_TMP}" "${GAMEINFO_FILE_PATH}"

  if validate_metamod_gameinfo_entry "${GAMEINFO_FILE_PATH}"; then
    log "Ensured Metamod search path entry in gameinfo.gi."
    return 0
  fi

  die "Metamod search path entry could not be validated after rewriting ${GAMEINFO_FILE_PATH}."
}
