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

echo "==> Running Prisma migrations"
# Resolve the postgres container IP to avoid hostname resolution issues
# inside the one-off migration container
PG_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  "$($DC ps -q postgres)")"

# Build a migration-only DATABASE_URL with the resolved IP in place of the hostname.
# This does NOT permanently rewrite .env.docker.
RAW_DB_URL="$(grep '^DATABASE_URL=' .env.docker | cut -d= -f2-)"
MIGRATION_DB_URL="$(echo "$RAW_DB_URL" | sed "s|@[^:/@]*|@${PG_IP}|")"

$DC run --rm \
  -e HOME=/tmp \
  -e XDG_CONFIG_HOME=/tmp/.config \
  -e DATABASE_URL="${MIGRATION_DB_URL}" \
  api sh -lc 'corepack pnpm --filter @quizmind/database db:migrate:deploy'

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
