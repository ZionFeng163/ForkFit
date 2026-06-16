#!/usr/bin/env bash
set -euo pipefail

SINCE="${SINCE:-24 hours ago}"
SERVICES="${SERVICES:-forkfit-backend forkfit-frontend nginx}"

for service in $SERVICES; do
  echo "== $service =="
  journalctl -u "$service" --since "$SINCE" --no-pager \
    | grep -Ei 'error|exception|traceback|failed|critical' \
    | tail -n "${LIMIT:-80}" || true
  echo
done
