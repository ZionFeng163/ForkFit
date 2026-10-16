#!/usr/bin/env bash
set -u

check_service() {
  local service="$1" url="$2" code="" attempt
  for attempt in 1 2; do
    code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "$url")" || code="000"
    case "$code" in
      200) return 0 ;;
      503)
        # The HTTP server is alive but shedding load. Restarting would interrupt AI jobs.
        logger -t forkfit-healthcheck "$service busy (503); not restarting"
        return 0
        ;;
    esac
    if [[ "$attempt" == 1 ]]; then sleep 2; fi
  done
  logger -t forkfit-healthcheck "$service failed two liveness checks (HTTP $code); restarting"
  systemctl restart "$service"
}

check_service forkfit-backend.service http://127.0.0.1:8000/healthz
check_service forkfit-frontend.service http://127.0.0.1:3001/zh/discover
