#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"
DC=(docker compose --env-file "$ENV_FILE" -f docker-compose.observability.yml)

echo "WARNING: Observability stack is RAM-heavy and may destabilize a 4GB VPS."
echo "Start only when explicitly needed."

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq quizmind-postgres; then
  echo "ERROR: quizmind-postgres is not running. Start the app stack first (postgres/redis/api/worker/web)." >&2
  exit 1
fi

DSN="$(awk -F= '/^[[:space:]]*POSTGRES_EXPORTER_DSN[[:space:]]*=/{print substr($0, index($0,$2)); exit}' "$ENV_FILE" | sed 's/^\s*//; s/^"//; s/"$//')"
if [[ -z "$DSN" ]]; then
  echo "ERROR: POSTGRES_EXPORTER_DSN must be set in $ENV_FILE before starting observability." >&2
  exit 1
fi

if ! docker run --rm --network container:quizmind-postgres -e POSTGRES_EXPORTER_DSN="$DSN" public.ecr.aws/docker/library/postgres:16-alpine \
  sh -lc 'PGCONNECT_TIMEOUT=5 psql "$POSTGRES_EXPORTER_DSN" -tAc "SELECT 1" >/dev/null' \
  >/dev/null 2>&1; then
  echo "ERROR: POSTGRES_EXPORTER_DSN validation failed against running postgres. Aborting observability startup." >&2
  exit 1
fi

"${DC[@]}" up -d
bash scripts/observability-status.sh
