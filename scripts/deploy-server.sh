#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/quizmind-platform"
DEPLOYED_SHA_FILE="${DEPLOY_DIR}/.deployed-sha"
ENV_FILE=".env.prod"
DC="docker compose --env-file ${ENV_FILE} -f docker-compose.yml -f docker-compose.prod.yml"

run_prod_env_preflight() {
  if command -v node >/dev/null 2>&1; then
    node scripts/check-prod-env.mjs "${ENV_FILE}"
    return
  fi

  docker run --rm \
    -v "${PWD}:/work:ro" \
    -w /work \
    public.ecr.aws/docker/library/node:22-bookworm-slim \
    node scripts/check-prod-env.mjs "${ENV_FILE}"
}

# Parse optional --sha and --ref arguments passed from CI
DEPLOYED_SHA=""
DEPLOYED_REF=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) DEPLOYED_SHA="$2"; shift 2 ;;
    --ref) DEPLOYED_REF="$2"; shift 2 ;;
    *) shift ;;
  esac
done

echo "==> Deploying QuizMind Platform"
cd "$DEPLOY_DIR"

echo "==> Checking ${ENV_FILE}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found at $(pwd)/${ENV_FILE}"
  echo "  Copy .env.prod.example to ${ENV_FILE} and fill in production values."
  exit 1
fi

echo "==> Updating code from origin/main"
git fetch origin
git reset --hard origin/main

CURRENT_SHA="$(git rev-parse HEAD)"
echo "==> Commit: ${CURRENT_SHA}"

echo "==> Validating ${ENV_FILE}"
run_prod_env_preflight

echo "==> Building images"
$DC build

echo "==> Starting postgres and redis"
$DC up -d postgres redis

echo "==> Waiting for postgres to be healthy"
for i in $(seq 1 30); do
  if $DC exec -T postgres pg_isready -q 2>/dev/null; then
    echo "  postgres is ready"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "ERROR: postgres did not become healthy in time"
    exit 1
  fi
  echo "  waiting... ($i/30)"
  sleep 2
done

echo "==> Waiting for redis to be healthy"
for i in $(seq 1 30); do
  if $DC exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "  redis is ready"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "ERROR: redis did not become healthy in time"
    exit 1
  fi
  echo "  waiting... ($i/30)"
  sleep 2
done

echo "==> Resolving postgres container IP"
PG_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  "$($DC ps -q postgres)")"

echo "==> Syncing Postgres role password from ${ENV_FILE}"
bash scripts/sync-postgres-role-password.sh "${ENV_FILE}"

echo "==> Preflight: verifying DB credentials against running Postgres"
# Uses pg.Client (require('pg'), available via shamefully-hoist=true) inside the
# built api image.  DATABASE_URL is passed as-is from .env.prod — no bash URL
# parsing.  Same hostname-to-IP rewrite used by migration and runtime containers.
if ! $DC run --rm \
    -e HOME=/tmp \
    -e XDG_CONFIG_HOME=/tmp/.config \
    -e DB_HOST_IP="${PG_IP}" \
    api node -e '
      const { Client } = require("pg");
      const u = new URL(process.env.DATABASE_URL);
      u.hostname = process.env.DB_HOST_IP;
      const client = new Client({ connectionString: u.toString() });
      client.connect()
        .then(() => client.end())
        .then(() => process.exit(0))
        .catch((err) => { process.stderr.write(err.message + "\n"); process.exit(1); });
    ' 2>&1; then
  echo ""
  echo "ERROR: DB authentication preflight FAILED."
  echo "  DATABASE_URL in ${ENV_FILE} cannot authenticate to the running Postgres."
  echo "  The persisted Postgres role password does not match ${ENV_FILE} credentials."
  echo ""
  echo "  To fix — choose one option:"
  echo "    A) Update the Postgres role password to match DATABASE_URL in ${ENV_FILE}:"
  echo "         docker exec -it quizmind-postgres psql -U <current_user> \\"
  echo "           -c \"ALTER USER <user> WITH PASSWORD '<password_from_env_docker>';\""
  echo "    B) Update DATABASE_URL (and POSTGRES_PASSWORD) in ${ENV_FILE} to match"
  echo "       the actual password stored in the persisted Postgres volume."
  echo ""
  echo "  See docs/deployment.md — 'Database Credential Management' for details."
  exit 1
fi
echo "  DB authentication OK"

echo "==> Running Prisma migrations"
# PG_IP already resolved above.

$DC run --rm \
  -e HOME=/tmp \
  -e XDG_CONFIG_HOME=/tmp/.config \
  -e DB_HOST_IP="${PG_IP}" \
  api sh -lc '
    export DATABASE_URL=$(node -e "const u=new URL(process.env.DATABASE_URL);u.hostname=process.env.DB_HOST_IP;process.stdout.write(u.toString())")
    exec corepack pnpm --filter @quizmind/database db:migrate:deploy
  '

echo "==> Migrations complete"

echo "==> Starting api, worker, and web"
$DC up -d api worker web

echo "==> Container status"
$DC ps

echo "==> Waiting for api to become healthy"
for i in $(seq 1 60); do
  _api_status=$(docker inspect --format='{{.State.Health.Status}}' quizmind-api 2>/dev/null || echo "missing")
  if [ "$_api_status" = "healthy" ]; then
    echo "  api is healthy"
    break
  fi
  if [ "$i" = "60" ]; then
    echo "ERROR: api did not become healthy within 3 minutes (last status: ${_api_status})"
    $DC logs --tail=50 api
    exit 1
  fi
  echo "  waiting for api... ($i/60) [${_api_status}]"
  sleep 3
done

echo "==> Waiting for web to become healthy"
for i in $(seq 1 60); do
  _web_status=$(docker inspect --format='{{.State.Health.Status}}' quizmind-web 2>/dev/null || echo "missing")
  if [ "$_web_status" = "healthy" ]; then
    echo "  web is healthy"
    break
  fi
  if [ "$i" = "60" ]; then
    echo "ERROR: web did not become healthy within 3 minutes (last status: ${_web_status})"
    $DC logs --tail=50 web
    exit 1
  fi
  echo "  waiting for web... ($i/60) [${_web_status}]"
  sleep 3
done

echo "==> Post-deploy smoke checks"
API_HOST_PORT="$(grep -E "^API_HOST_PORT=" "${ENV_FILE}" | head -1 | cut -d= -f2- | xargs || true)"
WEB_HOST_PORT="$(grep -E "^WEB_HOST_PORT=" "${ENV_FILE}" | head -1 | cut -d= -f2- | xargs || true)"
if [[ -z "$API_HOST_PORT" ]]; then
  echo "ERROR: API_HOST_PORT is missing or empty in ${ENV_FILE}"
  exit 1
fi
if [[ -z "$WEB_HOST_PORT" ]]; then
  echo "ERROR: WEB_HOST_PORT is missing or empty in ${ENV_FILE}"
  exit 1
fi
_smoke_fail=0
for _endpoint in "http://127.0.0.1:${API_HOST_PORT}/health" "http://127.0.0.1:${API_HOST_PORT}/ready"; do
  if curl -sf --max-time 10 "$_endpoint" > /dev/null; then
    echo "  OK: ${_endpoint}"
  else
    echo "  FAIL: ${_endpoint}"
    _smoke_fail=1
  fi
done
if curl -sf --max-time 15 "http://127.0.0.1:${WEB_HOST_PORT}" > /dev/null; then
  echo "  OK: http://127.0.0.1:${WEB_HOST_PORT} (web)"
else
  echo "  FAIL: http://127.0.0.1:${WEB_HOST_PORT} (web)"
  _smoke_fail=1
fi
if [ "$_smoke_fail" = "1" ]; then
  echo ""
  echo "ERROR: Post-deploy smoke checks FAILED. Deploy is in a broken state."
  echo "  Inspect logs:  $DC logs api"
  echo "  Inspect logs:  $DC logs web"
  exit 1
fi
echo "  All smoke checks passed."

echo "==> Pruning dangling images"
docker image prune -f

# Write deployed SHA metadata for auditability / rollback reference
cat > "${DEPLOYED_SHA_FILE}" <<EOF
sha=${CURRENT_SHA}
ref=${DEPLOYED_REF:-main}
ci_sha=${DEPLOYED_SHA:-${CURRENT_SHA}}
deployed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
echo "==> SHA recorded: ${DEPLOYED_SHA_FILE}"

echo "==> Deploy complete"
