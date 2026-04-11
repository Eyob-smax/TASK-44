#!/usr/bin/env bash
# CampusOps — Docker-first test orchestrator (no local node_modules)
#
# Usage:
#   ./run_tests.sh               # run all suites, no coverage
#   COVERAGE=true ./run_tests.sh # run with coverage where supported
#
# This runner intentionally avoids writing dependencies to the host workspace:
# source directories are mounted read-only into disposable containers, copied
# to container-local /work, then tested there.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COVERAGE="${COVERAGE:-false}"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-campusops-test-runner}"

FRONTEND_TEST_IMAGE="${FRONTEND_TEST_IMAGE:-node:18-alpine}"
BACKEND_TEST_IMAGE="${BACKEND_TEST_IMAGE:-node:18}"
BACKEND_INT_TEST_IMAGE="${BACKEND_INT_TEST_IMAGE:-node:18-alpine}"

MYSQL_DATABASE="${MYSQL_DATABASE:-campusops}"
MYSQL_USER="${MYSQL_USER:-campusops}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-campusops_pass}"
TEST_JWT_SECRET="${JWT_SECRET:-test-jwt-secret-runner}"
TEST_INTEGRATION_SIGNING_SECRET="${INTEGRATION_SIGNING_SECRET:-test-integration-secret-runner-32chars}"
TEST_AES_KEY="${AES_KEY:-a0a1a2a3a4a5a6a7a8a9b0b1b2b3b4b5a0a1a2a3a4a5a6a7a8a9b0b1b2b3b4b5}"
NETWORK_NAME="${PROJECT_NAME}_default"
DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@mysql:3306/${MYSQL_DATABASE}"
NPM_CACHE_VOLUME="${PROJECT_NAME}-npm-cache"

FAILED=0

to_docker_host_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -am "$p"
  else
    printf '%s' "$p"
  fi
}

FRONTEND_SRC="$(to_docker_host_path "$SCRIPT_DIR/frontend")"
BACKEND_SRC="$(to_docker_host_path "$SCRIPT_DIR/backend")"

compose_cmd() {
  JWT_SECRET="$TEST_JWT_SECRET" \
  INTEGRATION_SIGNING_SECRET="$TEST_INTEGRATION_SIGNING_SECRET" \
  AES_KEY="$TEST_AES_KEY" \
  COMPOSE_IGNORE_ORPHANS="True" \
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  compose_cmd down --remove-orphans -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

divider() {
  echo ""
  echo "──────────────────────────────────────────────────────────"
}

run_phase() {
  local label="$1"
  local command="$2"

  divider
  echo "  ▶  ${label}"
  divider

  if eval "$command"; then
    echo ""
    echo "  ✓  ${label} — all tests passed."
  else
    echo ""
    echo "  ✗  ${label} — failures detected."
    FAILED=$((FAILED + 1))
  fi
}

run_frontend_tests() {
  local test_cmd="npx vitest run --reporter=verbose unit_tests"
  if [[ "$COVERAGE" == "true" ]]; then
    test_cmd+=" --coverage"
  fi

  docker run --rm \
    --mount type=volume,source="$NPM_CACHE_VOLUME",target=/root/.npm \
    --mount type=bind,source="$FRONTEND_SRC",target=/src,readonly \
    "$FRONTEND_TEST_IMAGE" \
    sh -lc "set -e; echo '[frontend] preparing workspace...'; mkdir -p /work; cp -a /src/. /work; cd /work; echo '[frontend] installing dependencies...'; npm ci --no-audit --no-fund --loglevel=info; echo '[frontend] running tests...'; ${test_cmd}"
}

run_backend_unit_tests() {
  local test_cmd="npx vitest run --reporter=verbose unit_tests"
  if [[ "$COVERAGE" == "true" ]]; then
    test_cmd+=" --coverage"
  fi

  docker run --rm \
    --mount type=volume,source="$NPM_CACHE_VOLUME",target=/root/.npm \
    --mount type=bind,source="$BACKEND_SRC",target=/src,readonly \
    -e DATABASE_URL="$DATABASE_URL" \
    -e JWT_SECRET="$TEST_JWT_SECRET" \
    -e AES_KEY="$TEST_AES_KEY" \
    -e INTEGRATION_SIGNING_SECRET="$TEST_INTEGRATION_SIGNING_SECRET" \
    -e NODE_ENV="test" \
    "$BACKEND_TEST_IMAGE" \
    sh -lc "set -e; echo '[backend-unit] preparing workspace...'; mkdir -p /work; cp -a /src/. /work; cd /work; echo '[backend-unit] installing dependencies...'; npm ci --no-audit --no-fund --loglevel=info; echo '[backend-unit] running tests...'; ${test_cmd}"
}

run_backend_api_tests() {
  docker run --rm \
    --mount type=volume,source="$NPM_CACHE_VOLUME",target=/root/.npm \
    --mount type=bind,source="$BACKEND_SRC",target=/src,readonly \
    -e DATABASE_URL="$DATABASE_URL" \
    -e JWT_SECRET="$TEST_JWT_SECRET" \
    -e AES_KEY="$TEST_AES_KEY" \
    -e INTEGRATION_SIGNING_SECRET="$TEST_INTEGRATION_SIGNING_SECRET" \
    -e NODE_ENV="test" \
    "$BACKEND_TEST_IMAGE" \
    sh -lc "set -e; echo '[backend-api] preparing workspace...'; mkdir -p /work; cp -a /src/. /work; cd /work; echo '[backend-api] installing dependencies...'; npm ci --no-audit --no-fund --loglevel=info; echo '[backend-api] running tests...'; npx vitest run --reporter=verbose api_tests/*.ts"
}

wait_for_mysql_healthy() {
  local container_id
  container_id="$(compose_cmd ps -q mysql)"
  if [[ -z "$container_id" ]]; then
    echo "MySQL container was not created." >&2
    return 1
  fi

  local attempts=30
  while [[ "$attempts" -gt 0 ]]; do
    local health
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$container_id" 2>/dev/null || true)"
    if [[ "$health" == "healthy" ]]; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done

  echo "Timed out waiting for MySQL healthcheck." >&2
  return 1
}

run_backend_integration_tests() {
  echo "  ℹ  Starting MySQL service for integration tests..."
  compose_cmd up -d mysql >/dev/null
  echo "  ℹ  Waiting for MySQL healthcheck..."
  wait_for_mysql_healthy
  echo "  ℹ  MySQL is healthy. Running integration tests..."

  docker run --rm \
    --network "$NETWORK_NAME" \
    --mount type=volume,source="$NPM_CACHE_VOLUME",target=/root/.npm \
    -e DATABASE_URL="$DATABASE_URL" \
    -e JWT_SECRET="$TEST_JWT_SECRET" \
    -e AES_KEY="$TEST_AES_KEY" \
    -e INTEGRATION_SIGNING_SECRET="$TEST_INTEGRATION_SIGNING_SECRET" \
    -e STORAGE_PATH="/tmp/campusops-test-storage" \
    -e BACKUP_PATH="/tmp/campusops-test-backups" \
    -e NODE_ENV="test" \
    --mount type=bind,source="$BACKEND_SRC",target=/src,readonly \
    "$BACKEND_INT_TEST_IMAGE" \
    sh -lc "set -e; echo '[backend-int] installing mysql client...'; if command -v apk >/dev/null 2>&1; then apk add --no-cache mysql-client >/dev/null; elif command -v apt-get >/dev/null 2>&1; then apt-get update >/dev/null && apt-get install -y default-mysql-client >/dev/null; else echo 'No supported package manager found for mysql client install'; exit 1; fi; echo '[backend-int] preparing workspace...'; mkdir -p /work; cp -a /src/. /work; cd /work; echo '[backend-int] installing dependencies...'; npm ci --no-audit --no-fund --loglevel=info; echo '[backend-int] syncing prisma schema...'; npx prisma db push --skip-generate --accept-data-loss; echo '[backend-int] running tests...'; npx vitest run --reporter=verbose --maxWorkers=1 api_tests/integration"
}

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  CampusOps Test Runner (Dockerized, no local artifacts)"
if [[ "$COVERAGE" == "true" ]]; then
  echo "  Coverage: enabled where supported"
else
  echo "  Coverage: disabled (set COVERAGE=true to enable)"
fi
echo "══════════════════════════════════════════════════════════"

run_phase "Frontend Unit & Component Tests  [frontend/unit_tests/]" "run_frontend_tests"
run_phase "Backend Unit Tests  [backend/unit_tests/]" "run_backend_unit_tests"
run_phase "Backend API Contract Tests  [backend/api_tests/]" "run_backend_api_tests"
run_phase "Backend API Integration Tests  [backend/api_tests/integration/]" "run_backend_integration_tests"

echo ""
echo "══════════════════════════════════════════════════════════"
if [[ "$FAILED" -gt 0 ]]; then
  echo "  Result: $FAILED phase(s) FAILED."
  echo "══════════════════════════════════════════════════════════"
  exit 1
fi

echo "  Result: ALL PHASES PASSED."
if [[ "$COVERAGE" == "true" ]]; then
  echo "  Coverage reports are generated inside container workdirs for unit suites."
fi
echo "══════════════════════════════════════════════════════════"
exit 0
