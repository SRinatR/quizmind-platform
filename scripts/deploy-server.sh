#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/quizmind-platform"

echo "==> Deploying QuizMind Platform"
cd "$DEPLOY_DIR"

echo "==> Updating code from origin/main"
git fetch origin
git reset --hard origin/main

echo "==> Commit: $(git rev-parse HEAD)"

echo "==> Starting containers"
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker up -d --build

echo "==> Container status"
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker ps

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Deploy complete"
