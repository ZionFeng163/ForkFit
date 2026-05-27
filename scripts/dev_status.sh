#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.forkfit-dev/pids"

pid_for_port() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

show_port() {
  local name="$1"
  local port="$2"
  local pid
  pid="$(pid_for_port "$port")"
  if [[ -n "$pid" ]]; then
    printf '%-10s running  port=%s pid=%s\n' "$name" "$port" "$pid"
  else
    printf '%-10s stopped  port=%s\n' "$name" "$port"
  fi
}

show_pid_file() {
  local name="$1"
  local pid_file="$2"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    printf '%-10s running  pid=%s\n' "$name" "$(cat "$pid_file")"
  else
    printf '%-10s stopped\n' "$name"
  fi
}

show_worker() {
  local tracked_pid=""
  local live_pid=""

  if [[ -f "$PID_DIR/worker.pid" ]]; then
    tracked_pid="$(cat "$PID_DIR/worker.pid")"
  fi

  if [[ -n "$tracked_pid" ]] && kill -0 "$tracked_pid" 2>/dev/null; then
    printf '%-10s running  pid=%s\n' "Worker" "$tracked_pid"
    return 0
  fi

  live_pid="$(pgrep -f "python scripts/run_worker.py" 2>/dev/null | head -n 1 || true)"
  if [[ -n "$live_pid" ]]; then
    printf '%-10s running  pid=%s untracked\n' "Worker" "$live_pid"
  else
    printf '%-10s stopped\n' "Worker"
  fi
}

show_port "Postgres" "${DATABASE_PORT:-5432}"
show_port "Redis" "${REDIS_PORT:-6379}"
show_port "API" "${API_PORT:-8000}"
show_port "Frontend" "${WEB_PORT:-3000}"
show_worker
