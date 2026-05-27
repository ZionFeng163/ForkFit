#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.forkfit-dev/pids"

log() {
  printf '[forkfit] %s\n' "$*"
}

stop_pid_file() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    log "$name is not tracked"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    log "stopping $name PID $pid"
    kill "$pid" 2>/dev/null || true
  else
    log "$name PID $pid is not running"
  fi

  rm -f "$pid_file"
}

stop_pid_file "frontend" "$PID_DIR/frontend.pid"
stop_pid_file "worker" "$PID_DIR/worker.pid"
stop_pid_file "API" "$PID_DIR/api.pid"

log "stopped tracked ForkFit app processes"
log "Postgres and Redis are left running"
