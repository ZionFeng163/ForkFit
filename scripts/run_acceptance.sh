#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -p forkfit-e2e -f "$ROOT_DIR/docker-compose.e2e.yml")
REAL_TEST=0
case "${1:-}" in
  "") ;;
  --real)
    REAL_TEST=1
    COMPOSE+=(-f "$ROOT_DIR/docker-compose.e2e-real.yml")
    ;;
  *) echo "Usage: $0 [--real]" >&2; exit 64 ;;
esac

cleanup() {
  if [[ "${KEEP_E2E_STACK:-0}" != "1" ]]; then
    "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null
  fi
}
trap cleanup EXIT

echo "[1/6] Starting an isolated ForkFit stack"
"${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --force-recreate

echo "[2/6] Waiting for backend and frontend"
for _ in {1..90}; do
  if curl --noproxy '*' --max-time 3 --fail --silent http://127.0.0.1:38001/healthz >/dev/null; then
    break
  fi
  sleep 1
done
curl --noproxy '*' --max-time 3 --fail --silent http://127.0.0.1:38001/healthz >/dev/null

for _ in {1..120}; do
  if curl --noproxy '*' --max-time 3 --fail --silent http://127.0.0.1:33001/zh >/dev/null; then
    break
  fi
  sleep 1
done
curl --noproxy '*' --max-time 3 --fail --silent http://127.0.0.1:33001/zh >/dev/null

echo "[3/6] Running backend tests in Python 3.12"
"${COMPOSE[@]}" exec -T backend python -m unittest discover -s tests

echo "[4/6] Checking frontend types and lint"
cd "$ROOT_DIR/apps/web"
if [[ ! -d node_modules ]]; then
  npm ci
fi
npx playwright install chromium
npm run lint -- --max-warnings=0
npx tsc --noEmit
npx tsc --noEmit -p tsconfig.e2e.json

echo "[5/6] Building the production frontend"
npm run build

echo "[6/6] Running browser acceptance tests"
E2E_REAL="$REAL_TEST" E2E_TARGET=local E2E_BASE_URL=http://127.0.0.1:33001 npm run test:e2e

echo "ForkFit acceptance passed."
