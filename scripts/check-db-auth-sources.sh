#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: env file not found: ${ENV_FILE}" >&2
  exit 1
fi

mask_secret() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then echo "<empty>"; return; fi
  local len=${#value}
  if (( len <= 6 )); then echo "***"; return; fi
  echo "${value:0:2}***${value:len-2:2}"
}

env_val() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^ *//' -e 's/ *$//' -e 's/^"//' -e 's/"$//' ; }
sha_of(){ printf '%s' "$1" | sha256sum | awk '{print $1}'; }

POSTGRES_USER="$(env_val POSTGRES_USER || true)"
POSTGRES_DB="$(env_val POSTGRES_DB || true)"
DATABASE_URL="$(env_val DATABASE_URL || true)"
POSTGRES_EXPORTER_DSN="$(env_val POSTGRES_EXPORTER_DSN || true)"

echo "ENV source (${ENV_FILE}):"
echo "  POSTGRES_USER=$(mask_secret "$POSTGRES_USER")"
echo "  POSTGRES_DB=$(mask_secret "$POSTGRES_DB")"
echo "  DATABASE_URL=$(mask_secret "$DATABASE_URL")"
echo "  POSTGRES_EXPORTER_DSN=$(mask_secret "$POSTGRES_EXPORTER_DSN")"

env_db_sha="$(sha_of "$DATABASE_URL")"

echo "Container env sources:"
for c in quizmind-api quizmind-worker; do
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$c"; then
    v="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" | awk -F= '$1=="DATABASE_URL"{print substr($0,index($0,"=")+1)}' | tail -1)"
    echo "  ${c} DATABASE_URL=$(mask_secret "$v")"
    echo "  ${c} DATABASE_URL sha256=$(sha_of "$v")"
  else
    echo "  ${c}: <missing>"
  fi
done

if docker ps -a --format '{{.Names}}' | grep -Fxq quizmind-postgres-exporter; then
  ex="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' quizmind-postgres-exporter | awk -F= '$1=="DATA_SOURCE_NAME"{print substr($0,index($0,"=")+1)}' | tail -1)"
  echo "  quizmind-postgres-exporter DATA_SOURCE_NAME=$(mask_secret "$ex")"
else
  echo "  quizmind-postgres-exporter: <missing>"
fi

echo "Env DATABASE_URL sha256=${env_db_sha}"

echo "Testing .env DATABASE_URL via one-shot api container..."
docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml run --rm api sh -lc 'node -e "const {Client}=require(\"pg\");(async()=>{try{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.end();console.log(\"RESULT: .env DATABASE_URL works\");}catch(e){console.log(\"RESULT: .env DATABASE_URL fails: \"+e.message);process.exit(1);}})();"'

if [[ -n "$POSTGRES_EXPORTER_DSN" ]]; then
  echo "Testing POSTGRES_EXPORTER_DSN..."
  docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml run --rm -e DATABASE_URL="$POSTGRES_EXPORTER_DSN" api sh -lc 'node -e "const {Client}=require(\"pg\");(async()=>{try{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.end();console.log(\"RESULT: POSTGRES_EXPORTER_DSN works\");}catch(e){console.log(\"RESULT: POSTGRES_EXPORTER_DSN fails: \"+e.message);process.exit(1);}})();"'
fi
