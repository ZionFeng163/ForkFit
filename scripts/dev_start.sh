#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
RUN_DIR="$ROOT_DIR/.forkfit-dev"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"

CONDA_ENV="${CONDA_ENV:-forkfit-agent}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

mkdir -p "$LOG_DIR" "$PID_DIR"

log() {
  printf '[forkfit] %s\n' "$*"
}

die() {
  printf '[forkfit] ERROR: %s\n' "$*" >&2
  exit 1
}

pid_alive() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

pid_for_port() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

worker_pid() {
  pgrep -f "python scripts/run_worker.py" 2>/dev/null | head -n 1 || true
}

wait_for_port() {
  local name="$1"
  local port="$2"
  local timeout="${3:-30}"
  local elapsed=0

  while [[ "$elapsed" -lt "$timeout" ]]; do
    if [[ -n "$(pid_for_port "$port")" ]]; then
      log "$name is listening on port $port"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  die "$name did not start on port $port within ${timeout}s"
}

start_brew_service_if_needed() {
  local name="$1"
  local port="$2"
  shift 2
  local formulas=("$@")

  if [[ -n "$(pid_for_port "$port")" ]]; then
    log "$name already running on port $port"
    return 0
  fi

  if ! command -v brew >/dev/null 2>&1; then
    die "$name is not listening on port $port, and Homebrew is not available to start it"
  fi

  for formula in "${formulas[@]}"; do
    if brew list "$formula" >/dev/null 2>&1; then
      log "starting $name via brew services start $formula"
      brew services start "$formula" >/dev/null
      wait_for_port "$name" "$port" 20
      return 0
    fi
  done

  die "$name is not listening on port $port. Install/start one of: ${formulas[*]}"
}

load_env() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
    set +a
  fi
}

start_process() {
  local name="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3

  if [[ -f "$pid_file" ]] && pid_alive "$(cat "$pid_file")"; then
    log "$name already running with PID $(cat "$pid_file")"
    return 0
  fi

  log "starting $name"
  (
    cd "$ROOT_DIR"
    exec "$@"
  ) >"$log_file" 2>&1 &
  echo "$!" >"$pid_file"
}

start_frontend() {
  local pid_file="$PID_DIR/frontend.pid"
  local log_file="$LOG_DIR/frontend.log"

  if [[ -f "$pid_file" ]] && pid_alive "$(cat "$pid_file")"; then
    log "frontend already running with PID $(cat "$pid_file")"
    return 0
  fi

  log "building frontend (production)"
  (
    cd "$WEB_DIR"
    FORKFIT_API_BASE_URL="${FORKFIT_API_BASE_URL:-http://127.0.0.1:$API_PORT}" \
    npx next build
  ) >>"$log_file" 2>&1

  log "starting frontend"
  (
    cd "$WEB_DIR"
    exec env \
      FORKFIT_API_BASE_URL="${FORKFIT_API_BASE_URL:-http://127.0.0.1:$API_PORT}" \
      NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,::1}" \
      no_proxy="${no_proxy:-localhost,127.0.0.1,::1}" \
      npx next start -p "$WEB_PORT"
  ) >"$log_file" 2>&1 &
  echo "$!" >"$pid_file"
}

command -v conda >/dev/null 2>&1 || die "conda was not found on PATH"
[[ -d "$WEB_DIR/node_modules" ]] || die "apps/web/node_modules is missing. Run: cd apps/web && npm install"

load_env
export PYTHONPATH="$ROOT_DIR/src"
export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://zanestear@localhost:5432/forkfit}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"

start_brew_service_if_needed "Postgres" "$DATABASE_PORT" postgresql@15 postgresql@16 postgresql
start_brew_service_if_needed "Redis" "$REDIS_PORT" redis

api_port_pid="$(pid_for_port "$API_PORT")"
if [[ -n "$api_port_pid" ]]; then
  log "API port $API_PORT is already in use by PID $api_port_pid"
else
  start_process \
    "API" \
    "$PID_DIR/api.pid" \
    "$LOG_DIR/api.log" \
    conda run -n "$CONDA_ENV" --no-capture-output env PYTHONPATH="$PYTHONPATH" python scripts/run_api.py
  wait_for_port "API" "$API_PORT" 30
fi

existing_worker_pid="$(worker_pid)"
if [[ -n "$existing_worker_pid" ]]; then
  log "worker already running with PID $existing_worker_pid"
else
  start_process \
    "worker" \
    "$PID_DIR/worker.pid" \
    "$LOG_DIR/worker.log" \
    conda run -n "$CONDA_ENV" --no-capture-output env PYTHONPATH="$PYTHONPATH" python scripts/run_worker.py
fi

web_port_pid="$(pid_for_port "$WEB_PORT")"
if [[ -n "$web_port_pid" ]]; then
  log "frontend port $WEB_PORT is already in use by PID $web_port_pid"
else
  start_frontend
  wait_for_port "frontend" "$WEB_PORT" 30
fi

log "ready"
log "web: http://127.0.0.1:$WEB_PORT/en"
log "api: http://127.0.0.1:$API_PORT/openapi.json"
log "logs: $LOG_DIR"
