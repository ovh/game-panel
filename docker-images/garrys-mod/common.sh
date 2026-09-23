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

gmod_pid_file_path() {
  printf '%s/server.pid\n' "${RUNTIME_DIR:-/run/garrys-mod}"
}

gmod_fifo_path() {
  printf '%s/stdin.fifo\n' "${RUNTIME_DIR:-/run/garrys-mod}"
}

read_gmod_pid() {
  GMOD_PID_FILE="$(gmod_pid_file_path)"

  [ -f "${GMOD_PID_FILE}" ] || return 1

  GMOD_PID="$(cat "${GMOD_PID_FILE}" 2>/dev/null || true)"
  case "${GMOD_PID}" in
    ""|*[!0-9]*)
      return 1
      ;;
  esac

  printf '%s\n' "${GMOD_PID}"
}

is_gmod_server_running() {
  RUNNING_PID="$(read_gmod_pid)" || return 1
  kill -0 "${RUNNING_PID}" 2>/dev/null
}

gmod_install_root_dir() {
  printf '%s\n' "${GMOD_INSTALL_DIR:-${DATA_DIR:-/data}/server}"
}

gmod_game_dir() {
  printf '%s/garrysmod\n' "$(gmod_install_root_dir)"
}

gmod_server_binary() {
  case "${GMOD_BRANCH:-}" in
    x86-64)
      printf '%s/srcds_run_x64\n' "$(gmod_install_root_dir)"
      ;;
    *)
      printf '%s/srcds_run\n' "$(gmod_install_root_dir)"
      ;;
  esac
}

gmod_mount_cfg_file() {
  printf '%s/cfg/mount.cfg\n' "$(gmod_game_dir)"
}

backup_file_once() {
  SOURCE_FILE="$1"
  BACKUP_FILE="$2"

  if [ ! -e "${BACKUP_FILE}" ]; then
    cp -a "${SOURCE_FILE}" "${BACKUP_FILE}"
  fi
}

ensure_gmod_mount_entry() {
  MOUNT_KEY="$1"
  MOUNT_PATH="$2"
  MOUNT_FILE="$(gmod_mount_cfg_file)"
  MOUNT_DIR="$(dirname "${MOUNT_FILE}")"

  mkdir -p "${MOUNT_DIR}"

  if [ ! -f "${MOUNT_FILE}" ]; then
    printf '"mountcfg"\n{\n\t"%s"\t"%s"\n}\n' "${MOUNT_KEY}" "${MOUNT_PATH}" > "${MOUNT_FILE}"
    log "Created ${MOUNT_FILE} with the '${MOUNT_KEY}' mount."
    return 0
  fi

  backup_file_once "${MOUNT_FILE}" "${MOUNT_FILE}.gameserver.bak"

  MOUNT_TMP="$(mktemp "${MOUNT_DIR}/.mount.cfg.XXXXXX")"

  if awk -v key="${MOUNT_KEY}" -v path="${MOUNT_PATH}" '
    {
      lines[NR] = $0
      if ($0 ~ /^[[:space:]]*}/) {
        lastBrace = NR
      }
    }

    END {
      entry = "\t\"" key "\"\t\"" path "\""
      written = 0

      for (i = 1; i <= NR; i++) {
        if (lines[i] ~ ("^[[:space:]]*\"" key "\"")) {
          if (!written) {
            print entry
            written = 1
          }
          continue
        }

        if (i == lastBrace && !written) {
          print entry
          written = 1
        }

        print lines[i]
      }

      if (!written) {
        exit 42
      }
    }
  ' "${MOUNT_FILE}" > "${MOUNT_TMP}"; then
    :
  else
    AWK_RESULT=$?
    rm -f "${MOUNT_TMP}"

    if [ "${AWK_RESULT}" -eq 42 ]; then
      die "Could not find the closing brace of ${MOUNT_FILE} to add the '${MOUNT_KEY}' mount."
    fi

    die "Failed to rewrite ${MOUNT_FILE}."
  fi

  mv "${MOUNT_TMP}" "${MOUNT_FILE}"
  log "Ensured the '${MOUNT_KEY}' mount in ${MOUNT_FILE}."
}

remove_gmod_mount_entry() {
  MOUNT_KEY="$1"
  MOUNT_PATH="$2"
  MOUNT_FILE="$(gmod_mount_cfg_file)"
  MOUNT_DIR="$(dirname "${MOUNT_FILE}")"

  [ -f "${MOUNT_FILE}" ] || return 0

  MOUNT_TMP="$(mktemp "${MOUNT_DIR}/.mount.cfg.XXXXXX")"

  if awk -v key="${MOUNT_KEY}" -v path="${MOUNT_PATH}" '
    BEGIN {
      removed = 0
    }

    {
      line = $0
      gsub(/[[:space:]]+/, " ", line)
      sub(/^ /, "", line)
      sub(/ $/, "", line)

      if (line == "\"" key "\" \"" path "\"") {
        removed = 1
        next
      }

      print $0
    }

    END {
      if (!removed) {
        exit 42
      }
    }
  ' "${MOUNT_FILE}" > "${MOUNT_TMP}"; then
    :
  else
    rm -f "${MOUNT_TMP}"
    return 0
  fi

  mv "${MOUNT_TMP}" "${MOUNT_FILE}"
  log "Removed the '${MOUNT_KEY}' mount from ${MOUNT_FILE}."
}
