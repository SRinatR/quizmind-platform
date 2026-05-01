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

if ! awk -F= '/^[[:space:]]*POSTGRES_EXPORTER_DSN[[:space:]]*=/{found=1} END{exit found?0:1}' "$ENV_FILE"; then
  echo "ERROR: POSTGRES_EXPORTER_DSN must be set in $ENV_FILE before starting observability." >&2
  exit 1
fi

"${DC[@]}" up -d
bash scripts/observability-status.sh
