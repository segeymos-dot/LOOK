#!/usr/bin/env bash
# LOOK development Desktop launcher.
# Starts/reuses Docker → local Supabase → Next.js (:3000) → Electron attach mode.
# Does not touch remote Supabase, Stripe, migrations, or secret files.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.nvm/current/bin:${HOME}/.volta/bin:/usr/bin:/bin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${DESKTOP_DIR}/.." && pwd)"

LOG_DIR="${HOME}/Library/Logs/LOOK"
LOG_FILE="${LOG_DIR}/dev-launcher.log"
PID_DIR="${HOME}/Library/Application Support/LOOK"
NEXT_PID_FILE="${PID_DIR}/next-dev.pid"
LOCK_FILE="${PID_DIR}/dev-launcher.lock"

PORT="${LOOK_PORT:-3000}"
APP_URL="http://127.0.0.1:${PORT}"
ELECTRON_BIN="${DESKTOP_DIR}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
ELECTRON_PID_FILE="${PID_DIR}/electron-dev.pid"

mkdir -p "${LOG_DIR}" "${PID_DIR}"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  # Never log env file contents or secret values.
  printf '[%s] %s\n' "$(timestamp)" "$*" | tee -a "${LOG_FILE}"
}

show_error() {
  local message="$1"
  log "ERROR: ${message}"
  /usr/bin/osascript - "${message}" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  display dialog (item 1 of argv) with title "LOOK" buttons {"OK"} default button 1 with icon stop
end run
APPLESCRIPT
}

is_http_ok() {
  local url="$1"
  local code
  code="$(/usr/bin/curl -m 3 -sS -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null || echo 000)"
  # Ready means the server answered successfully — do not treat 5xx as ready.
  [[ "${code}" =~ ^[23][0-9][0-9]$ ]]
}

# True only when the home page is 200, references Next assets, and a CSS chunk is text/css 200.
is_styled_ready() {
  local html_file code css_href css_url css_code css_type
  html_file="$(mktemp "${TMPDIR:-/tmp}/look-home.XXXXXX")"

  code="$(/usr/bin/curl -m 8 -sS -o "${html_file}" -w '%{http_code}' "${APP_URL}/" 2>/dev/null || echo 000)"
  if [[ "${code}" != "200" ]]; then
    rm -f "${html_file}"
    return 1
  fi

  if ! /usr/bin/grep -q '/_next/' "${html_file}"; then
    rm -f "${html_file}"
    return 1
  fi

  css_href="$(
    /usr/bin/grep -oE 'href="/_next/static/[^"]+\.css[^"]*"' "${html_file}" \
      | /usr/bin/head -1 \
      | /usr/bin/sed -E 's/^href="//; s/"$//'
  )"
  rm -f "${html_file}"

  if [[ -z "${css_href}" ]]; then
    return 1
  fi

  if [[ "${css_href}" == http* ]]; then
    css_url="${css_href}"
  else
    css_url="${APP_URL}${css_href}"
  fi

  css_code="$(/usr/bin/curl -m 8 -sS -o /dev/null -w '%{http_code}' "${css_url}" 2>/dev/null || echo 000)"
  css_type="$(/usr/bin/curl -m 8 -sS -o /dev/null -w '%{content_type}' "${css_url}" 2>/dev/null || true)"

  [[ "${css_code}" == "200" ]] && [[ "${css_type}" == *css* ]]
}

stop_next_on_port() {
  local pids
  pids="$(port_listener_pids)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi
  log "Stopping unhealthy Next.js listener(s) on port ${PORT}: ${pids}"
  # shellcheck disable=SC2086
  kill ${pids} 2>/dev/null || true
  sleep 1
  pids="$(port_listener_pids)"
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill -9 ${pids} 2>/dev/null || true
    sleep 1
  fi
}

wait_until_styled_ready() {
  local max_attempts="${1:-120}"
  local next_pid="${2:-}"
  local i
  for i in $(seq 1 "${max_attempts}"); do
    if is_styled_ready; then
      return 0
    fi
    if [[ -n "${next_pid}" ]] && ! kill -0 "${next_pid}" 2>/dev/null; then
      return 1
    fi
    sleep 1
  done
  return 1
}

docker_running() {
  /usr/local/bin/docker info >/dev/null 2>&1 || /opt/homebrew/bin/docker info >/dev/null 2>&1 || docker info >/dev/null 2>&1
}

supabase_containers_up() {
  local count
  count="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c '^supabase_.*_LOOK$' || true)"
  [[ "${count}" -ge 8 ]]
}

find_npm() {
  local candidate
  for candidate in \
    /opt/homebrew/bin/npm \
    /usr/local/bin/npm \
    "${HOME}/.nvm/current/bin/npm" \
    "${HOME}/.volta/bin/npm"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  command -v npm
}

find_supabase() {
  local candidate
  for candidate in \
    /opt/homebrew/bin/supabase \
    /usr/local/bin/supabase \
    "${PROJECT_ROOT}/node_modules/.bin/supabase"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  command -v supabase
}

# Remove a PID/lock file only when its recorded process no longer exists.
clean_stale_pid_file() {
  local file="$1"
  local label="${2:-process}"
  if [[ ! -f "${file}" ]]; then
    return 0
  fi
  local old_pid
  old_pid="$(tr -d '[:space:]' < "${file}" || true)"
  if [[ -z "${old_pid}" ]]; then
    rm -f "${file}"
    return 0
  fi
  if kill -0 "${old_pid}" 2>/dev/null; then
    return 0
  fi
  log "Removing stale ${label} pid file (pid ${old_pid} no longer exists)"
  rm -f "${file}"
}

# Main LOOK Electron processes only (never Cursor / Docker Electron helpers).
# Prefer literal path match over pgrep -f (regex + argv truncation issues).
look_electron_pids() {
  local pid cmd
  while read -r pid cmd; do
    [[ -z "${pid}" ]] && continue
    # Main binary only — skip GPU/Renderer Helper processes.
    case "${cmd}" in
      *"Helper"*) continue ;;
    esac
    case "${cmd}" in
      *"${ELECTRON_BIN}"*)
        printf '%s\n' "${pid}"
        ;;
    esac
  done < <(/bin/ps -axo pid=,command= 2>/dev/null || true)
}

look_electron_running() {
  local pids
  pids="$(look_electron_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  [[ -n "${pids}" ]]
}

acquire_lock() {
  clean_stale_pid_file "${LOCK_FILE}" "launcher lock"
  clean_stale_pid_file "${NEXT_PID_FILE}" "Next.js"
  clean_stale_pid_file "${ELECTRON_PID_FILE}" "Electron"

  if [[ -f "${LOCK_FILE}" ]]; then
    local old_pid
    old_pid="$(tr -d '[:space:]' < "${LOCK_FILE}" || true)"
    if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
      log "Another LOOK launcher is already running (pid ${old_pid}); waiting briefly"
      local i
      for i in $(seq 1 60); do
        if [[ ! -f "${LOCK_FILE}" ]]; then
          break
        fi
        sleep 1
      done
      if [[ -f "${LOCK_FILE}" ]]; then
        old_pid="$(tr -d '[:space:]' < "${LOCK_FILE}" || true)"
        if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
          # If Electron is already up, prefer focusing it over failing the click.
          if look_electron_running; then
            log "Launcher busy but LOOK Electron is already running — focusing via second-instance"
            launch_electron_focus_only || true
            exit 0
          fi
          show_error "LOOK is already starting. Please wait a few seconds and try again."
          exit 1
        fi
      fi
    fi
  fi
  printf '%s\n' "$$" > "${LOCK_FILE}"
  trap 'rm -f "${LOCK_FILE}"' EXIT
}

ensure_docker() {
  if docker_running; then
    log "Docker Desktop is running"
    return 0
  fi

  log "Docker Desktop is not running; attempting to open it"
  if [[ -d "/Applications/Docker.app" ]]; then
    open -a Docker || true
  else
    show_error "Docker Desktop is not installed or not found in /Applications.
Install Docker Desktop, start it, then open LOOK again."
    exit 1
  fi

  local i
  for i in $(seq 1 90); do
    if docker_running; then
      log "Docker Desktop became ready"
      return 0
    fi
    sleep 2
  done

  show_error "Docker Desktop did not become ready in time.
Open Docker Desktop manually, wait until it is running, then open LOOK again."
  exit 1
}

ensure_supabase() {
  if supabase_containers_up; then
    log "Local Supabase containers already running — reusing"
    return 0
  fi

  local supabase_bin
  supabase_bin="$(find_supabase)" || true
  if [[ -z "${supabase_bin}" ]]; then
    show_error "Supabase CLI was not found.
Install it (brew install supabase/tap/supabase), then open LOOK again."
    exit 1
  fi

  log "Starting local Supabase (no reset, no migrations apply)"
  local supabase_out
  supabase_out="$(mktemp "${TMPDIR:-/tmp}/look-supabase-start.XXXXXX")"
  if ! (
    cd "${PROJECT_ROOT}"
    # Local only. Never pass linked remote project flags.
    "${supabase_bin}" start
  ) >"${supabase_out}" 2>&1; then
    # Keep failure context, but strip secret-looking lines.
    /usr/bin/grep -Eiv 'key|secret|password|jwt|token|service_role|anon' "${supabase_out}" >>"${LOG_FILE}" || true
    rm -f "${supabase_out}"
    show_error "Failed to start local Supabase.
Check Docker Desktop and see:
${LOG_FILE}"
    exit 1
  fi
  /usr/bin/grep -Eiv 'key|secret|password|jwt|token|service_role|anon' "${supabase_out}" >>"${LOG_FILE}" || true
  rm -f "${supabase_out}"

  if ! supabase_containers_up; then
    show_error "Local Supabase did not report healthy containers after start.
See log:
${LOG_FILE}"
    exit 1
  fi

  log "Local Supabase is ready"
}

port_listener_pids() {
  /usr/sbin/lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true
}

ensure_next() {
  if is_styled_ready; then
    log "Next.js already styled and ready at ${APP_URL} — reusing"
    return 0
  fi

  if is_http_ok "${APP_URL}"; then
    log "Next.js responds on ${APP_URL} but CSS/assets are not ready — restarting"
    stop_next_on_port
  else
    local existing
    existing="$(port_listener_pids)"
    if [[ -n "${existing}" ]]; then
      log "Port ${PORT} has a listener but LOOK is not healthy yet; waiting briefly"
      if wait_until_styled_ready 20; then
        log "Existing Next.js became styled and ready"
        return 0
      fi
      log "Existing listener never became styled — restarting"
      stop_next_on_port
    fi
  fi

  local npm_bin
  npm_bin="$(find_npm)" || true
  if [[ -z "${npm_bin}" ]]; then
    show_error "npm was not found. Install Node.js, then open LOOK again."
    exit 1
  fi

  if [[ ! -f "${PROJECT_ROOT}/package.json" ]]; then
    show_error "LOOK project not found at:
${PROJECT_ROOT}"
    exit 1
  fi

  log "Starting Next.js development server on port ${PORT}"
  # Detach so quitting Electron / the launcher does not stop the dev server.
  nohup env -u ELECTRON_RUN_AS_NODE \
    PORT="${PORT}" \
    LOOK_DESKTOP=1 \
    NEXT_PUBLIC_APP_URL="${APP_URL}" \
    /bin/bash -lc "cd $(printf '%q' "${PROJECT_ROOT}") && $(printf '%q' "${npm_bin}") run dev" \
    >>"${LOG_FILE}" 2>&1 &
  local next_pid=$!
  disown "${next_pid}" 2>/dev/null || true
  printf '%s\n' "${next_pid}" > "${NEXT_PID_FILE}"
  log "Started Next.js (launcher-owned pid ${next_pid})"

  if wait_until_styled_ready 120 "${next_pid}"; then
    log "Next.js is styled and ready at ${APP_URL}"
    return 0
  fi

  if ! kill -0 "${next_pid}" 2>/dev/null; then
    show_error "Next.js exited before becoming ready.
See log:
${LOG_FILE}"
    exit 1
  fi

  show_error "Next.js did not become fully styled at ${APP_URL} in time.
CSS assets must return HTTP 200. See log:
${LOG_FILE}"
  exit 1
}

ensure_electron_runtime() {
  if [[ -x "${ELECTRON_BIN}" ]]; then
    return 0
  fi
  local npm_bin
  npm_bin="$(find_npm)"
  log "Preparing Electron runtime"
  (
    cd "${DESKTOP_DIR}"
    "${npm_bin}" install
    node "${SCRIPT_DIR}/ensure-electron.cjs"
  ) >>"${LOG_FILE}" 2>&1 || {
    show_error "Failed to prepare Electron runtime.
See log:
${LOG_FILE}"
    exit 1
  }
}

# Single Electron invocation — never backgrounded, never open -n, never recursive.
run_electron_once() {
  (
    cd "${DESKTOP_DIR}"
    env -u ELECTRON_RUN_AS_NODE \
      LOOK_DEV_MODE=1 \
      LOOK_PORT="${PORT}" \
      LOOK_DESKTOP=1 \
      LOOK_PROJECT_ROOT="${PROJECT_ROOT}" \
      NEXT_PUBLIC_APP_URL="${APP_URL}" \
      "${ELECTRON_BIN}" .
  ) >>"${LOG_FILE}" 2>&1
}

# When LOOK is already open, start Electron once so requestSingleInstanceLock
# focuses the existing window; the second process exits immediately.
launch_electron_focus_only() {
  ensure_electron_runtime
  if [[ ! -x "${ELECTRON_BIN}" ]]; then
    return 1
  fi
  log "LOOK Electron already running — requesting focus via second-instance"
  run_electron_once
  local status=$?
  log "Focus Electron helper exited with status ${status}"
  return 0
}

launch_electron() {
  ensure_electron_runtime

  if [[ ! -x "${ELECTRON_BIN}" ]]; then
    show_error "Electron runtime is missing after setup.
See log:
${LOG_FILE}"
    exit 1
  fi

  # Primary protection is Electron's requestSingleInstanceLock().
  # If a LOOK Electron is already alive, only trigger focus — do not keep a
  # second long-lived process, and do not treat its quick exit as failure.
  if look_electron_running; then
    launch_electron_focus_only
    return 0
  fi

  log "Launching Electron in attach/dev mode (${APP_URL})"
  # Electron's requestSingleInstanceLock() is the source of truth for windows.
  # Do not write a PID file for Electron — helper/main PIDs are process-scanned.
  rm -f "${ELECTRON_PID_FILE}"

  run_electron_once
  local status=$?
  log "Electron exited with status ${status}"

  # If another instance took over / focused, treat as success.
  if [[ "${status}" -ne 0 ]] && look_electron_running; then
    log "Electron exit ${status} but LOOK window still running — treating as success"
    return 0
  fi

  return "${status}"
}

main() {
  log "===== LOOK development launcher start ====="
  log "Project: ${PROJECT_ROOT}"

  if [[ ! -f "${PROJECT_ROOT}/package.json" ]] \
    || ! grep -q '"name"[[:space:]]*:[[:space:]]*"look"' "${PROJECT_ROOT}/package.json"; then
    show_error "Invalid LOOK project root:
${PROJECT_ROOT}"
    exit 1
  fi

  acquire_lock

  # Fast path: services already up + Electron already open → focus only.
  if look_electron_running && is_styled_ready; then
    log "Services ready and LOOK Electron already open — focusing existing window"
    rm -f "${LOCK_FILE}"
    trap - EXIT
    launch_electron_focus_only
    exit 0
  fi

  ensure_docker
  ensure_supabase
  ensure_next

  if ! is_styled_ready; then
    show_error "LOOK Next.js is not fully ready at ${APP_URL}.
CSS assets must return HTTP 200. See log:
${LOG_FILE}"
    exit 1
  fi

  # Release lock before Electron blocks, so a second click can focus/reuse.
  rm -f "${LOCK_FILE}"
  trap - EXIT

  # Start Electron exactly once (foreground). No open -n, no background twin.
  launch_electron || {
    show_error "LOOK Electron window failed to start.
See log:
${LOG_FILE}"
    exit 1
  }
}

main "$@"
