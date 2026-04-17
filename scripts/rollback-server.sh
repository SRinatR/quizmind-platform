#!/usr/bin/env bash
# rollback-server.sh — Roll back the quizmind-platform deployment to a specific git SHA.
#
# Usage:
#   bash scripts/rollback-server.sh --sha <git-commit-sha>
#
# The script:
#   1. Checks out the given SHA in the deploy directory
#   2. Restarts all app containers with that code
#   3. Writes the rolled-back SHA to .deployed-sha
#
# Run via GitHub Actions (see .github/workflows/rollback.yml) or manually on the VPS.

set -euo pipefail

DEPLOY_DIR="/opt/quizmind-platform"
DEPLOYED_SHA_FILE="${DEPLOY_DIR}/.deployed-sha"
TARGET_SHA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) TARGET_SHA="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "${TARGET_SHA}" ]]; then
  echo "ERROR: --sha <commit-sha> is required."
  echo "Usage: bash scripts/rollback-server.sh --sha <git-commit-sha>"
  exit 1
fi

echo "==> Rolling back QuizMind Platform to ${TARGET_SHA}"
cd "$DEPLOY_DIR"

# Verify SHA exists locally (fetch first if needed)
if ! git cat-file -t "${TARGET_SHA}" &>/dev/null; then
  echo "==> SHA not found locally — fetching..."
  git fetch origin
fi

if ! git cat-file -t "${TARGET_SHA}" &>/dev/null; then
  echo "ERROR: SHA ${TARGET_SHA} not found in repository."
  exit 1
fi

echo "==> Checking out ${TARGET_SHA}"
git reset --hard "${TARGET_SHA}"

CURRENT_SHA="$(git rev-parse HEAD)"
echo "==> Now at: ${CURRENT_SHA}"

echo "==> Restarting containers"
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker up -d --build

echo "==> Container status"
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker ps

echo "==> Pruning dangling images"
docker image prune -f

# Record rollback
cat > "${DEPLOYED_SHA_FILE}" <<EOF
sha=${CURRENT_SHA}
ref=rollback
ci_sha=${TARGET_SHA}
deployed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
rollback=true
EOF
echo "==> Rollback SHA recorded: ${DEPLOYED_SHA_FILE}"

echo "==> Rollback complete to ${TARGET_SHA}"
