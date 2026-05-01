#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"
DC=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq quizmind-postgres; then
  echo "ERROR: quizmind-postgres container is not running." >&2
  exit 1
fi

PG_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$(${DC[@]} ps -q postgres)")"

set +e
output="$(${DC[@]} run --rm \
  -e HOME=/tmp \
  -e XDG_CONFIG_HOME=/tmp/.config \
  -e DB_HOST_IP="$PG_IP" \
  api node -e '
    const { Client } = require("pg");
    (async () => {
      try {
        const u = new URL(process.env.DATABASE_URL);
        u.hostname = process.env.DB_HOST_IP;
        const client = new Client({ connectionString: u.toString() });
        await client.connect();
        await client.query("SELECT 1");
        await client.end();
        console.log("DB OK");
      } catch (err) {
        const msg = err && err.message ? String(err.message) : "unknown database error";
        console.error(`DB AUTH FAILED: ${msg.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://***:***@")}`);
        process.exit(1);
      }
    })();
  ' 2>&1)"
status=$?
set -e

if [[ $status -ne 0 ]]; then
  printf '%s\n' "$output" >&2
  exit 1
fi

printf '%s\n' "$output"
