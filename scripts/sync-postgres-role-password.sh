#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: env file not found: ${ENV_FILE}" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -v key="$key" '
    function trim(s) {
      sub(/^[[:space:]]+/, "", s)
      sub(/[[:space:]]+$/, "", s)
      return s
    }
    BEGIN { found = 0 }
    {
      line = $0
      sub(/\r$/, "", line)
      line = trim(line)
      if (line == "" || line ~ /^#/) next
      if (line ~ /^export[[:space:]]+/) {
        sub(/^export[[:space:]]+/, "", line)
        line = trim(line)
      }
      eq = index(line, "=")
      if (eq <= 1) next
      k = trim(substr(line, 1, eq - 1))
      if (k != key) next
      v = trim(substr(line, eq + 1))
      if (v ~ /^'\''.*'\''$/) {
        v = substr(v, 2, length(v) - 2)
      } else if (v ~ /^".*"$/) {
        v = substr(v, 2, length(v) - 2)
        gsub(/\\n/, "\n", v)
        gsub(/\\r/, "\r", v)
        gsub(/\\t/, "\t", v)
        gsub(/\\"/, "\"", v)
      } else {
        sub(/[[:space:]]+#.*$/, "", v)
        v = trim(v)
      }
      print v
      found = 1
      exit
    }
    END { if (!found) exit 1 }
  ' "$ENV_FILE"
}

DB_USER="$(read_env_value POSTGRES_USER || true)"
DB_PASS="$(read_env_value POSTGRES_PASSWORD || true)"

if [[ -z "${DB_USER}" || -z "${DB_PASS}" ]]; then
  echo "ERROR: POSTGRES_USER and POSTGRES_PASSWORD must be set in ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! "${DB_USER}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "ERROR: POSTGRES_USER must match ^[A-Za-z_][A-Za-z0-9_]*$: ${DB_USER}" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq quizmind-postgres; then
  echo "ERROR: quizmind-postgres container is not running." >&2
  exit 1
fi

ROLE_EXISTS="$(
  docker exec -u postgres -i quizmind-postgres psql -d postgres -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}';"
)"

if [[ "${ROLE_EXISTS//[[:space:]]/}" != "1" ]]; then
  echo "ERROR: Postgres role does not exist: ${DB_USER}" >&2
  exit 1
fi

docker exec -u postgres -i quizmind-postgres psql -d postgres \
  -v "user=${DB_USER}" \
  -v "pass=${DB_PASS}" <<'SQL' >/dev/null
ALTER ROLE :"user" WITH PASSWORD :'pass';
SQL

echo "Synced Postgres role password for role \"${DB_USER}\" from ${ENV_FILE}."
