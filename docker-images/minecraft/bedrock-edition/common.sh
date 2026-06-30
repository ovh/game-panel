#!/bin/sh

LOG_PREFIX="${LOG_PREFIX:-[bedrock]}"

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

bedrock_fifo_path() {
  printf '%s/stdin.fifo\n' "${RUNTIME_DIR:-/run/minecraft-bedrock}"
}

bedrock_pid_file_path() {
  printf '%s/server.pid\n' "${RUNTIME_DIR:-/run/minecraft-bedrock}"
}

read_bedrock_pid() {
  BEDROCK_PID_FILE="$(bedrock_pid_file_path)"

  [ -f "${BEDROCK_PID_FILE}" ] || return 1

  BEDROCK_PID="$(cat "${BEDROCK_PID_FILE}" 2>/dev/null || true)"
  case "${BEDROCK_PID}" in
    ""|*[!0-9]*)
      return 1
      ;;
  esac

  printf '%s\n' "${BEDROCK_PID}"
}

is_bedrock_server_running() {
  RUNNING_PID="$(read_bedrock_pid)" || return 1
  kill -0 "${RUNNING_PID}" 2>/dev/null
}

assert_bedrock_server_stopped() {
  if RUNNING_PID="$(read_bedrock_pid)" && kill -0 "${RUNNING_PID}" 2>/dev/null; then
    die "Bedrock server is still running with PID ${RUNNING_PID}. Stop the server before running this operation."
  fi
}

server_artifact_relative_to_data() {
  SERVER_ARTIFACT_PATH="${SERVER_ARTIFACT:-${BEDROCK_SERVER_BIN:-}}"

  case "${SERVER_ARTIFACT_PATH}" in
    "${DATA_DIR:-/data}"/*)
      printf '%s\n' "${SERVER_ARTIFACT_PATH#${DATA_DIR}/}"
      ;;
    *)
      return 1
      ;;
  esac
}

gameserver_meta_file() {
  printf '%s\n' "${GAMESERVER_META_FILE:-${DATA_DIR:-/data}/.gameserver-meta.json}"
}

metadata_file_relative_to_data() {
  META_FILE="$(gameserver_meta_file)"

  case "${META_FILE}" in
    "${DATA_DIR:-/data}"/*)
      printf '%s\n' "${META_FILE#${DATA_DIR}/}"
      ;;
    *)
      return 1
      ;;
  esac
}

metadata_value_from_file() {
  META_FILE="$1"
  JQ_FILTER="$2"

  [ -f "${META_FILE}" ] || return 1
  jq -er "${JQ_FILTER} // empty" "${META_FILE}" 2>/dev/null
}

metadata_value_from_json() {
  META_JSON="$1"
  JQ_FILTER="$2"

  [ -n "${META_JSON}" ] || return 1
  printf '%s' "${META_JSON}" | jq -er "${JQ_FILTER} // empty" 2>/dev/null
}

metadata_identity_from_file() {
  META_FILE="$1"

  [ -f "${META_FILE}" ] || return 1
  jq -er '
    def non_empty_string: type == "string" and length > 0;

    select(type == "object")
    | select(.serverType == "bedrock")
    | select(.bedrockVersion | non_empty_string)
    | [
        .serverType,
        .bedrockVersion,
        (.artifact.sourceUrl // "")
      ]
    | map(tostring)
    | join("|")
  ' "${META_FILE}" 2>/dev/null
}

metadata_identity_from_json() {
  META_JSON="$1"

  [ -n "${META_JSON}" ] || return 1
  printf '%s' "${META_JSON}" | jq -er '
    def non_empty_string: type == "string" and length > 0;

    select(type == "object")
    | select(.serverType == "bedrock")
    | select(.bedrockVersion | non_empty_string)
    | [
        .serverType,
        .bedrockVersion,
        (.artifact.sourceUrl // "")
      ]
    | map(tostring)
    | join("|")
  ' 2>/dev/null
}

write_bedrock_metadata() {
  MC_VERSION_VALUE="$1"
  DOWNLOAD_URL_VALUE="$2"
  DOWNLOAD_SHA256_VALUE="${3:-}"
  ARTIFACT_PATH="$(server_artifact_relative_to_data || printf '%s\n' "${SERVER_ARTIFACT:-${BEDROCK_SERVER_BIN:-}}")"

  META_FILE="$(gameserver_meta_file)"
  META_DIR="$(dirname "${META_FILE}")"

  mkdir -p "${META_DIR}"
  META_TMP="$(mktemp "${META_DIR}/.gameserver-meta.XXXXXX")"

  jq -n \
    --arg bedrockVersion "${MC_VERSION_VALUE}" \
    --arg downloadUrl "${DOWNLOAD_URL_VALUE}" \
    --arg artifactPath "${ARTIFACT_PATH}" \
    --arg sha256 "${DOWNLOAD_SHA256_VALUE}" '
      {
        schemaVersion: 1,
        serverType: "bedrock",
        bedrockVersion: $bedrockVersion,
        artifact: {
          path: $artifactPath,
          sourceUrl: $downloadUrl
        }
      }
      | if $sha256 != "" then
          .artifact.checksum = {sha256: $sha256}
        else
          .
        end
    ' > "${META_TMP}"

  mv "${META_TMP}" "${META_FILE}"
}

curl_to_stdout() {
  CURL_URL="$1"

  if [ -n "${CURL_USER_AGENT:-}" ]; then
    curl -fsSL \
      -A "${CURL_USER_AGENT}" \
      --retry "${CURL_RETRY_COUNT:-3}" \
      --retry-delay "${CURL_RETRY_DELAY_SECONDS:-2}" \
      --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS:-15}" \
      --max-time "${CURL_MAX_TIME_SECONDS:-300}" \
      "${CURL_URL}"
  else
    curl -fsSL \
      --retry "${CURL_RETRY_COUNT:-3}" \
      --retry-delay "${CURL_RETRY_DELAY_SECONDS:-2}" \
      --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS:-15}" \
      --max-time "${CURL_MAX_TIME_SECONDS:-300}" \
      "${CURL_URL}"
  fi
}

download_to_file() {
  DOWNLOAD_URL="$1"
  DOWNLOAD_DEST="$2"
  DOWNLOAD_CHECKSUM="${3:-}"
  DOWNLOAD_CHECKSUM_ALGORITHM="${4:-sha256}"
  DOWNLOAD_DEST_DIR="$(dirname "${DOWNLOAD_DEST}")"

  mkdir -p "${DOWNLOAD_DEST_DIR}"
  DOWNLOAD_TMP="$(mktemp "${DOWNLOAD_DEST_DIR}/.download.XXXXXX")"

  if [ -n "${CURL_USER_AGENT:-}" ]; then
    CURL_RESULT=0
    curl -fsSL \
      -A "${CURL_USER_AGENT}" \
      --retry "${CURL_RETRY_COUNT:-3}" \
      --retry-delay "${CURL_RETRY_DELAY_SECONDS:-2}" \
      --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS:-15}" \
      --max-time "${CURL_MAX_TIME_SECONDS:-300}" \
      -o "${DOWNLOAD_TMP}" \
      "${DOWNLOAD_URL}" || CURL_RESULT=$?
  else
    CURL_RESULT=0
    curl -fsSL \
      --retry "${CURL_RETRY_COUNT:-3}" \
      --retry-delay "${CURL_RETRY_DELAY_SECONDS:-2}" \
      --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS:-15}" \
      --max-time "${CURL_MAX_TIME_SECONDS:-300}" \
      -o "${DOWNLOAD_TMP}" \
      "${DOWNLOAD_URL}" || CURL_RESULT=$?
  fi

  if [ "${CURL_RESULT}" -ne 0 ]; then
    rm -f "${DOWNLOAD_TMP}"
    return 1
  fi

  if [ -n "${DOWNLOAD_CHECKSUM}" ]; then
    case "${DOWNLOAD_CHECKSUM_ALGORITHM}" in
      sha256)
        CHECKSUM_COMMAND="sha256sum"
        ;;
      *)
        rm -f "${DOWNLOAD_TMP}"
        die "Unsupported checksum algorithm: ${DOWNLOAD_CHECKSUM_ALGORITHM}"
        ;;
    esac

    if ! printf '%s  %s\n' "${DOWNLOAD_CHECKSUM}" "${DOWNLOAD_TMP}" | "${CHECKSUM_COMMAND}" -c -; then
      rm -f "${DOWNLOAD_TMP}"
      return 1
    fi
  fi

  mv "${DOWNLOAD_TMP}" "${DOWNLOAD_DEST}"
}
