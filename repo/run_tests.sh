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
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-campusops-test-runner}"

FRONTEND_TEST_IMAGE="${FRONTEND_TEST_IMAGE:-node:18-alpine}"
BACKEND_TEST_IMAGE="${BACKEND_TEST_IMAGE:-node:18}"
BACKEND_INT_TEST_IMAGE="${BACKEND_INT_TEST_IMAGE:-node:18}"

MYSQL_DATABASE="${MYSQL_DATABASE:-campusops}"
MYSQL_USER="${MYSQL_USER:-campusops}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-campusops_pass}"
TEST_JWT_SECRET="${JWT_SECRET:-test-jwt-secret-runner}"
TEST_INTEGRATION_SIGNING_SECRET="${INTEGRATION_SIGNING_SECRET:-test-integration-secret-runner-32chars}"
TEST_AES_KEY="${AES_KEY:-a0a1a2a3a4a5a6a7a8a9b0b1b2b3b4b5a0a1a2a3a4a5a6a7a8a9b0b1b2b3b4b5}"
NETWORK_NAME="${PROJECT_NAME}_default"
DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@mysql:3306/${MYSQL_DATABASE}"
NPM_CACHE_VOLUME="${PROJECT_NAME}-npm-cache"
COVERAGE_LOG_DIR="${SCRIPT_DIR}/.coverage-logs"
COVERAGE_THRESHOLD_STATEMENTS="${COVERAGE_THRESHOLD_STATEMENTS:-80}"
COVERAGE_THRESHOLD_BRANCHES="${COVERAGE_THRESHOLD_BRANCHES:-70}"
COVERAGE_THRESHOLD_FUNCTIONS="${COVERAGE_THRESHOLD_FUNCTIONS:-80}"
COVERAGE_THRESHOLD_LINES="${COVERAGE_THRESHOLD_LINES:-80}"

FAILED=0
COVERAGE_GATE_FAILED=0

to_docker_host_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -am "$p"
  else
    printf '%s' "$p"
  fi
}

COMPOSE_FILE="$(to_docker_host_path "$SCRIPT_DIR/docker-compose.test.yml")"
FRONTEND_SRC="$(to_docker_host_path "$SCRIPT_DIR/frontend")"
BACKEND_SRC="$(to_docker_host_path "$SCRIPT_DIR/backend")"

docker_cmd() {
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker "$@"
}

compose_cmd() {
  JWT_SECRET="$TEST_JWT_SECRET" \
  INTEGRATION_SIGNING_SECRET="$TEST_INTEGRATION_SIGNING_SECRET" \
  AES_KEY="$TEST_AES_KEY" \
  COMPOSE_IGNORE_ORPHANS="True" \
  docker_cmd compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  compose_cmd down --remove-orphans -v >/dev/null 2>&1 || true
  rm -rf "$COVERAGE_LOG_DIR" 2>/dev/null || true
}
trap cleanup EXIT

divider() {
  echo ""
  echo "──────────────────────────────────────────────────────────"
}

run_phase() {
  local label="$1"
  local command="$2"
  local log_key="${3:-}"

  divider
  echo "  ▶  ${label}"
  divider

  local status=0
  if [[ "$COVERAGE" == "true" && -n "$log_key" ]]; then
    mkdir -p "$COVERAGE_LOG_DIR"
    eval "$command" 2>&1 | tee "$COVERAGE_LOG_DIR/${log_key}.log" || status=$?
  else
    eval "$command" || status=$?
  fi

  if [[ $status -eq 0 ]]; then
    echo ""
    echo "  ✓  ${label} — all tests passed."
  else
    echo ""
    echo "  ✗  ${label} — failures detected."
    FAILED=$((FAILED + 1))
  fi
}

print_coverage_summary() {
  if [[ "$COVERAGE" != "true" ]]; then
    return 0
  fi
  if [[ ! -d "$COVERAGE_LOG_DIR" ]]; then
    return 0
  fi

  local log line
  local stmts_covered=0 stmts_total=0
  local branches_covered=0 branches_total=0
  local funcs_covered=0 funcs_total=0
  local lines_covered=0 lines_total=0
  local found=0

  for log in "$COVERAGE_LOG_DIR"/*.log; do
    [[ -f "$log" ]] || continue
    line="$(grep -E '^\[coverage-totals\]' "$log" | tail -1 || true)"
    if [[ "$line" =~ statements=([0-9]+)/([0-9]+)[[:space:]]+branches=([0-9]+)/([0-9]+)[[:space:]]+functions=([0-9]+)/([0-9]+)[[:space:]]+lines=([0-9]+)/([0-9]+) ]]; then
      stmts_covered=$((stmts_covered + BASH_REMATCH[1]))
      stmts_total=$((stmts_total + BASH_REMATCH[2]))
      branches_covered=$((branches_covered + BASH_REMATCH[3]))
      branches_total=$((branches_total + BASH_REMATCH[4]))
      funcs_covered=$((funcs_covered + BASH_REMATCH[5]))
      funcs_total=$((funcs_total + BASH_REMATCH[6]))
      lines_covered=$((lines_covered + BASH_REMATCH[7]))
      lines_total=$((lines_total + BASH_REMATCH[8]))
      found=$((found + 1))
    fi
  done

  if [[ "$found" -eq 0 ]]; then
    divider
    echo "  Coverage Summary"
    divider
    echo "  ✗ No combined coverage totals were captured from phase logs."
    COVERAGE_GATE_FAILED=1
    return 0
  fi

  local pct_statements pct_branches pct_functions pct_lines
  pct_statements="$(awk -v c="$stmts_covered" -v t="$stmts_total" 'BEGIN{if(t==0) printf "0.00"; else printf "%.2f", (c*100)/t}')"
  pct_branches="$(awk -v c="$branches_covered" -v t="$branches_total" 'BEGIN{if(t==0) printf "0.00"; else printf "%.2f", (c*100)/t}')"
  pct_functions="$(awk -v c="$funcs_covered" -v t="$funcs_total" 'BEGIN{if(t==0) printf "0.00"; else printf "%.2f", (c*100)/t}')"
  pct_lines="$(awk -v c="$lines_covered" -v t="$lines_total" 'BEGIN{if(t==0) printf "0.00"; else printf "%.2f", (c*100)/t}')"

  divider
  echo "  Coverage Summary (combined across all phases)"
  divider
  printf "  Statements: %s/%s (%s%%)\n" "$stmts_covered" "$stmts_total" "$pct_statements"
  printf "  Branches:   %s/%s (%s%%)\n" "$branches_covered" "$branches_total" "$pct_branches"
  printf "  Functions:  %s/%s (%s%%)\n" "$funcs_covered" "$funcs_total" "$pct_functions"
  printf "  Lines:      %s/%s (%s%%)\n" "$lines_covered" "$lines_total" "$pct_lines"

  local below=0
  if ! awk -v p="$pct_statements" -v t="$COVERAGE_THRESHOLD_STATEMENTS" 'BEGIN{exit !(p+0>=t+0)}'; then below=1; fi
  if ! awk -v p="$pct_branches" -v t="$COVERAGE_THRESHOLD_BRANCHES" 'BEGIN{exit !(p+0>=t+0)}'; then below=1; fi
  if ! awk -v p="$pct_functions" -v t="$COVERAGE_THRESHOLD_FUNCTIONS" 'BEGIN{exit !(p+0>=t+0)}'; then below=1; fi
  if ! awk -v p="$pct_lines" -v t="$COVERAGE_THRESHOLD_LINES" 'BEGIN{exit !(p+0>=t+0)}'; then below=1; fi

  if [[ "$below" -eq 1 ]]; then
    echo ""
    echo "  ✗ Combined coverage gate failed."
    echo "    Required: statements>=${COVERAGE_THRESHOLD_STATEMENTS}% branches>=${COVERAGE_THRESHOLD_BRANCHES}% functions>=${COVERAGE_THRESHOLD_FUNCTIONS}% lines>=${COVERAGE_THRESHOLD_LINES}%"
    COVERAGE_GATE_FAILED=1
  else
    echo ""
    echo "  ✓ Combined coverage gate passed."
  fi

  echo ""
}

run_frontend_tests() {
  local test_cmd="npx vitest run --reporter=verbose unit_tests"
  if [[ "$COVERAGE" == "true" ]]; then
    test_cmd+=" --coverage --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0 --coverage.reporter=json-summary"
  fi

  docker_cmd run --rm \
    --mount type=volume,source="$NPM_CACHE_VOLUME",target=/root/.npm \
    --mount type=bind,source="$FRONTEND_SRC",target=/src,readonly \
    "$FRONTEND_TEST_IMAGE" \
    sh -lc "set -e; echo '[frontend] preparing workspace...'; mkdir -p /work; cp -a /src/. /work; cd /work; echo '[frontend] installing dependencies (with retries for transient registry failures)...'; (npm ci --no-audit --no-fund --loglevel=info || (echo '[frontend] npm ci failed, retrying in 5s...' && sleep 5 && rm -rf node_modules && npm ci --no-audit --no-fund --loglevel=info) || (echo '[frontend] npm ci failed again, final retry in 10s...' && sleep 10 && rm -rf node_modules && npm ci --no-audit --no-fund --loglevel=info)); echo '[frontend] running tests...'; ${test_cmd}; if [ -f ./coverage/coverage-summary.json ]; then node -e 'const fs=require(\"fs\");const p=\"./coverage/coverage-summary.json\";const t=JSON.parse(fs.readFileSync(p,\"utf8\")).total;console.log(\"[coverage-totals] statements=\"+t.statements.covered+\"/\"+t.statements.total+\" branches=\"+t.branches.covered+\"/\"+t.branches.total+\" functions=\"+t.functions.covered+\"/\"+t.functions.total+\" lines=\"+t.lines.covered+\"/\"+t.lines.total);'; fi"
}

run_backend_unit_tests() {
  local test_cmd="npx vitest run --reporter=verbose --pool forks unit_tests"
  if [[ "$COVERAGE" == "true" ]]; then
    test_cmd+=" --coverage --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0 --coverage.reporter=json-summary"
  fi

  docker_cmd run --rm \
    --mount type=volume,source="$NPM_CACHE_VOLUME",target=/root/.npm \
    --mount type=bind,source="$BACKEND_SRC",target=/src,readonly \
    -e DATABASE_URL="$DATABASE_URL" \
    -e PRISMA_CLIENT_ENGINE_TYPE="binary" \
    -e JWT_SECRET="$TEST_JWT_SECRET" \
    -e AES_KEY="$TEST_AES_KEY" \
    -e INTEGRATION_SIGNING_SECRET="$TEST_INTEGRATION_SIGNING_SECRET" \
    -e NODE_ENV="test" \
    "$BACKEND_TEST_IMAGE" \
    sh -lc "set -e; echo '[backend-unit] preparing workspace...'; mkdir -p /work; cp -a /src/. /work; cd /work; echo '[backend-unit] installing dependencies (with retries for transient Prisma engine download failures)...'; (npm ci --no-audit --no-fund --loglevel=info || (echo '[backend-unit] npm ci failed, retrying in 5s...' && sleep 5 && rm -rf node_modules && npm ci --no-audit --no-fund --loglevel=info) || (echo '[backend-unit] npm ci failed again, final retry in 10s...' && sleep 10 && rm -rf node_modules && npm ci --no-audit --no-fund --loglevel=info)); echo '[backend-unit] generating Prisma client...'; npx prisma generate; echo '[backend-unit] running tests...'; ${test_cmd}; if [ -f ./coverage/coverage-summary.json ]; then node -e 'const fs=require(\"fs\");const p=\"./coverage/coverage-summary.json\";const t=JSON.parse(fs.readFileSync(p,\"utf8\")).total;console.log(\"[coverage-totals] statements=\"+t.statements.covered+\"/\"+t.statements.total+\" branches=\"+t.branches.covered+\"/\"+t.branches.total+\" functions=\"+t.functions.covered+\"/\"+t.functions.total+\" lines=\"+t.lines.covered+\"/\"+t.lines.total);'; fi"
}

run_backend_api_tests() {
  local test_cmd="npx vitest run --reporter=verbose api_tests/*.ts"
  if [[ "$COVERAGE" == "true" ]]; then
    test_cmd+=" --coverage --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0 --coverage.reporter=json-summary"
  fi

  docker_cmd run --rm \
    --mount type=volume,source="$NPM_CACHE_VOLUME",target=/root/.npm \
    --mount type=bind,source="$BACKEND_SRC",target=/src,readonly \
    -e DATABASE_URL="$DATABASE_URL" \
    -e PRISMA_CLIENT_ENGINE_TYPE="binary" \
    -e JWT_SECRET="$TEST_JWT_SECRET" \
    -e AES_KEY="$TEST_AES_KEY" \
    -e INTEGRATION_SIGNING_SECRET="$TEST_INTEGRATION_SIGNING_SECRET" \
    -e NODE_ENV="test" \
    "$BACKEND_TEST_IMAGE" \
    sh -lc "set -e; echo '[backend-api] preparing workspace...'; mkdir -p /work; cp -a /src/. /work; cd /work; echo '[backend-api] installing dependencies (with retries for transient Prisma engine download failures)...'; (npm ci --no-audit --no-fund --loglevel=info || (echo '[backend-api] npm ci failed, retrying in 5s...' && sleep 5 && rm -rf node_modules && npm ci --no-audit --no-fund --loglevel=info) || (echo '[backend-api] npm ci failed again, final retry in 10s...' && sleep 10 && rm -rf node_modules && npm ci --no-audit --no-fund --loglevel=info)); echo '[backend-api] generating Prisma client...'; npx prisma generate; echo '[backend-api] running tests...'; ${test_cmd}; if [ -f ./coverage/coverage-summary.json ]; then node -e 'const fs=require(\"fs\");const p=\"./coverage/coverage-summary.json\";const t=JSON.parse(fs.readFileSync(p,\"utf8\")).total;console.log(\"[coverage-totals] statements=\"+t.statements.covered+\"/\"+t.statements.total+\" branches=\"+t.branches.covered+\"/\"+t.branches.total+\" functions=\"+t.functions.covered+\"/\"+t.functions.total+\" lines=\"+t.lines.covered+\"/\"+t.lines.total);'; fi"
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
    health="$(docker_cmd inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$container_id" 2>/dev/null || true)"
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
  compose_cmd up -d mysql >/dev/null || return 1
  echo "  ℹ  Waiting for MySQL healthcheck..."
  wait_for_mysql_healthy || return 1
  echo "  ℹ  MySQL is healthy. Running integration tests..."

  docker_cmd run --rm \
    --network "$NETWORK_NAME" \
    --mount type=volume,source="$NPM_CACHE_VOLUME",target=/root/.npm \
    -e DATABASE_URL="$DATABASE_URL" \
    -e PRISMA_CLIENT_ENGINE_TYPE="binary" \
    -e MYSQL_SSL_MODE="DISABLED" \
    -e JWT_SECRET="$TEST_JWT_SECRET" \
    -e AES_KEY="$TEST_AES_KEY" \
    -e INTEGRATION_SIGNING_SECRET="$TEST_INTEGRATION_SIGNING_SECRET" \
    -e STORAGE_PATH="/tmp/campusops-test-storage" \
    -e BACKUP_PATH="/tmp/campusops-test-backups" \
    -e NODE_ENV="test" \
    --mount type=bind,source="$BACKEND_SRC",target=/src,readonly \
    "$BACKEND_INT_TEST_IMAGE" \
      sh -lc "set -e; echo '[backend-int] preparing workspace...'; mkdir -p /work; cp -a /src/. /work; cd /work; echo '[backend-int] installing dependencies (with retries for transient Prisma engine download failures)...'; (npm ci --no-audit --no-fund --loglevel=info || (echo '[backend-int] npm ci failed, retrying in 5s...' && sleep 5 && rm -rf node_modules && npm ci --no-audit --no-fund --loglevel=info) || (echo '[backend-int] npm ci failed again, final retry in 10s...' && sleep 10 && rm -rf node_modules && npm ci --no-audit --no-fund --loglevel=info)); echo '[backend-int] ensuring MySQL client tools are available...'; if ! command -v mysqldump >/dev/null 2>&1 || ! command -v mysql >/dev/null 2>&1; then if command -v apt-get >/dev/null 2>&1; then DEBIAN_FRONTEND=noninteractive apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends default-mysql-client >/dev/null; elif command -v apk >/dev/null 2>&1; then apk add --no-cache mysql-client >/dev/null; else echo 'No supported package manager found to install MySQL client tools'; exit 1; fi; fi; echo '[backend-int] generating Prisma client...'; npx prisma generate; echo '[backend-int] resetting and syncing prisma schema...'; npx prisma db push --force-reset --skip-generate --accept-data-loss; echo '[backend-int] ensuring prisma migration metadata table exists for restore verification...'; npx prisma db execute --file /work/prisma/test-bootstrap.sql --schema /work/prisma/schema.prisma; echo '[backend-int] running non-destructive integration tests...'; npx vitest run --coverage --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0 --coverage.reporter=json-summary --reporter=verbose --pool forks api_tests/integration --exclude api_tests/integration/backup-restore.integration.test.ts; echo '[backend-int] running destructive backup/restore integration test in isolation...'; npx vitest run --reporter=verbose api_tests/integration/backup-restore.integration.test.ts; if [ -f ./coverage/coverage-summary.json ]; then node -e 'const fs=require(\"fs\");const p=\"./coverage/coverage-summary.json\";const t=JSON.parse(fs.readFileSync(p,\"utf8\")).total;console.log(\"[coverage-totals] statements=\"+t.statements.covered+\"/\"+t.statements.total+\" branches=\"+t.branches.covered+\"/\"+t.branches.total+\" functions=\"+t.functions.covered+\"/\"+t.functions.total+\" lines=\"+t.lines.covered+\"/\"+t.lines.total);'; fi"
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

run_phase "Frontend Unit & Component Tests  [frontend/unit_tests/]" "run_frontend_tests" "frontend-unit"
run_phase "Backend Unit Tests  [backend/unit_tests/]" "run_backend_unit_tests" "backend-unit"
run_phase "Backend API Contract Tests  [backend/api_tests/]" "run_backend_api_tests" "backend-api"
run_phase "Backend API Integration Tests  [backend/api_tests/integration/]" "run_backend_integration_tests" "backend-int"

print_coverage_summary

echo ""
echo "══════════════════════════════════════════════════════════"
if [[ "$FAILED" -gt 0 ]]; then
  echo "  Result: $FAILED phase(s) FAILED."
  echo "══════════════════════════════════════════════════════════"
  exit 1
fi

if [[ "$COVERAGE_GATE_FAILED" -gt 0 ]]; then
  echo "  Result: FAILED (combined coverage gate not met)."
  echo "══════════════════════════════════════════════════════════"
  exit 1
fi

echo "  Result: ALL PHASES PASSED."
echo "══════════════════════════════════════════════════════════"
exit 0
