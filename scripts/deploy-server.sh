#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/quizmind-platform"
DEPLOYED_SHA_FILE="${DEPLOY_DIR}/.deployed-sha"
DC="docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker"

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

echo "==> Updating code from origin/main"
git fetch origin
git reset --hard origin/main

CURRENT_SHA="$(git rev-parse HEAD)"
echo "==> Commit: ${CURRENT_SHA}"

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

echo "==> Preflight: verifying DB authentication"
# Extract DATABASE_URL from .env.docker and parse user/pass/db using bash
# string operations (no external tools required).  URL format expected:
#   postgresql://USER:PASSWORD@HOST:PORT/DBNAME
_DB_URL_RAW="$(grep -E '^DATABASE_URL=' .env.docker | head -1 | cut -d= -f2-)"
if [[ -z "$_DB_URL_RAW" ]]; then
  echo "ERROR: DATABASE_URL not found in .env.docker — cannot run preflight check"
  exit 1
fi
_DB_USERINFO="${_DB_URL_RAW##*://}"   # strip scheme://
_DB_USERINFO="${_DB_USERINFO%%@*}"    # keep only user:password
_DB_USER="${_DB_USERINFO%%:*}"
_DB_PASS="${_DB_USERINFO#*:}"
_DB_NAME="${_DB_URL_RAW##*/}"
_DB_NAME="${_DB_NAME%%\?*}"           # strip query string if present
if ! docker exec \
    -e PGPASSWORD="${_DB_PASS}" \
    quizmind-postgres \
    psql -U "${_DB_USER}" -d "${_DB_NAME}" -c "SELECT 1" -q --no-psqlrc \
    > /dev/null 2>&1; then
  echo ""
  echo "ERROR: DB authentication preflight FAILED."
  echo "  The credentials in .env.docker (DATABASE_URL) cannot authenticate to the"
  echo "  running Postgres instance. The persisted database role password does not"
  echo "  match what is configured in .env.docker."
  echo ""
  echo "  To fix — choose one option:"
  echo "    A) Update the Postgres role to match .env.docker:"
  echo "         docker exec -it quizmind-postgres psql -U <current_user> \\"
  echo "           -c \"ALTER USER ${_DB_USER} WITH PASSWORD '<new_password>';\""
  echo "    B) Update DATABASE_URL (and POSTGRES_PASSWORD) in .env.docker to match"
  echo "       the actual password stored in the persisted Postgres volume."
  echo ""
  echo "  See docs/deployment.md — 'Database Credential Management' for details."
  exit 1
fi
echo "  DB authentication OK"

echo "==> Running Prisma migrations"
# Resolve the postgres container IP to avoid hostname resolution issues
# inside the one-off migration container
PG_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  "$($DC ps -q postgres)")"

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
