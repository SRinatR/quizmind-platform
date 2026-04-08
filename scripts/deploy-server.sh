#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/quizmind-platform"
DEPLOYED_SHA_FILE="${DEPLOY_DIR}/.deployed-sha"

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

# Default to main when no ref provided (e.g. direct manual invocation)
DEPLOY_REF="${DEPLOYED_REF:-main}"

# Sanitize: reject refs with shell-unsafe or git-unsafe characters.
# Allow: alphanumeric, hyphen, underscore, dot, forward-slash (for branch paths).
# Deny: anything starting with '-', containing '..', '//', or other metacharacters.
if [[ ! "$DEPLOY_REF" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ ]] || \
   [[ "$DEPLOY_REF" == *".."* ]] || \
   [[ "$DEPLOY_REF" == *"//"* ]]; then
  echo "ERROR: Invalid or unsafe ref: '${DEPLOY_REF}'"
  exit 1
fi

echo "==> Deploying QuizMind Platform (ref: ${DEPLOY_REF})"
cd "$DEPLOY_DIR"

echo "==> Fetching remote refs"
git fetch origin

echo "==> Verifying ref exists on remote"
if ! git rev-parse --verify "origin/${DEPLOY_REF}" > /dev/null 2>&1; then
  echo "ERROR: Ref '${DEPLOY_REF}' not found on remote origin."
  echo "       Ensure the branch exists and has been pushed before deploying."
  exit 1
fi

echo "==> Resetting to origin/${DEPLOY_REF}"
git reset --hard "origin/${DEPLOY_REF}"

CURRENT_SHA="$(git rev-parse HEAD)"
echo "==> Commit: ${CURRENT_SHA}"

echo "==> Starting containers"
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker up -d --build

echo "==> Container status"
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker ps

echo "==> Pruning dangling images"
docker image prune -f

# Write deployed SHA metadata for auditability / rollback reference
cat > "${DEPLOYED_SHA_FILE}" <<EOF
sha=${CURRENT_SHA}
ref=${DEPLOY_REF}
ci_sha=${DEPLOYED_SHA:-${CURRENT_SHA}}
deployed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
echo "==> SHA recorded: ${DEPLOYED_SHA_FILE}"

echo "==> Deploy complete"
