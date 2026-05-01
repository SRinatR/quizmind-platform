#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"

resolve_api_host_port() {
  if [[ -n "${API_HOST_PORT:-}" ]]; then
    printf '%s\n' "$API_HOST_PORT"
    return
  fi

  if [[ -f "$ENV_FILE" ]]; then
    local value
    value="$(awk -F= '/^[[:space:]]*API_HOST_PORT[[:space:]]*=/{v=$2; sub(/^[[:space:]]+/,"",v); sub(/[[:space:]]+$/,"",v); gsub(/\"/,"",v); print v; exit}' "$ENV_FILE" || true)"
    if [[ -n "$value" ]]; then
      printf '%s\n' "$value"
      return
    fi
  fi

  printf '4000\n'
}

echo "== UTC time =="
date -u

echo "\n== free -h =="
free -h || true

echo "\n== /proc/meminfo (selected) =="
awk '/^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SReclaimable|SwapTotal|SwapFree|CommitLimit|Committed_AS):/ { print }' /proc/meminfo || true

echo "\n== Top RSS processes =="
ps aux --sort=-rss | head -30 || true

echo "\n== docker stats --no-stream =="
docker stats --no-stream || true

echo "\n== quizmind container status =="
docker ps -a --filter "name=quizmind-" --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' || true

echo "\n== Docker json log file sizes (largest 30) =="
sudo du -h /var/lib/docker/containers/*/*-json.log 2>/dev/null | sort -h | tail -30 || true

echo "\n== Recent Postgres auth failures (30m) =="
docker logs --since=30m quizmind-postgres 2>&1 | grep -Ei 'password authentication failed|28P01|FATAL' || true

echo "\n== Recent API errors (30m) =="
docker logs --since=30m quizmind-api 2>&1 | grep -Ei 'P1000|28P01|password authentication failed|EAI_AGAIN|ECONNREFUSED|ioredis|Unhandled error' || true

echo "\n== Recent worker Redis errors (30m) =="
docker logs --since=30m quizmind-worker 2>&1 | grep -Ei 'ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ioredis|Unhandled error' || true

if docker ps --format '{{.Names}}' | grep -Fxq quizmind-redis; then
  echo "\n== Redis INFO memory =="
  docker exec quizmind-redis redis-cli INFO memory || true
  echo "\n== Redis INFO keyspace =="
  docker exec quizmind-redis redis-cli INFO keyspace || true
fi

API_PORT="$(resolve_api_host_port)"
echo "\n== API /health =="
curl -s "http://127.0.0.1:${API_PORT}/health" || true
echo "\n== API /ready =="
curl -s "http://127.0.0.1:${API_PORT}/ready" || true
echo ""
