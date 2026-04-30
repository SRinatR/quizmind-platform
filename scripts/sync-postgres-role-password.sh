#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: env file not found: ${ENV_FILE}" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  node -e '
    const fs = require("node:fs");
    const path = process.argv[1];
    const key = process.argv[2];
    const text = fs.readFileSync(path, "utf8");

    function unquote(value) {
      const trimmed = value.trim();
      if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("\'") && trimmed.endsWith("\'"))) {
        const inner = trimmed.slice(1, -1);
        if (trimmed.startsWith("\"")) {
          return inner
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\\"/g, "\"");
        }
        return inner;
      }
      const commentIndex = trimmed.search(/\s+#/);
      return (commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed).trim();
    }

    for (const rawLine of text.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("export ")) line = line.slice("export ".length).trim();
      const sep = line.indexOf("=");
      if (sep <= 0) continue;
      const k = line.slice(0, sep).trim();
      if (k !== key) continue;
      const v = unquote(line.slice(sep + 1));
      process.stdout.write(v);
      process.exit(0);
    }
    process.exit(1);
  ' "${ENV_FILE}" "$key"
}

DB_USER="$(read_env_value POSTGRES_USER || true)"
DB_PASS="$(read_env_value POSTGRES_PASSWORD || true)"

if [[ -z "${DB_USER}" || -z "${DB_PASS}" ]]; then
  echo "ERROR: POSTGRES_USER and POSTGRES_PASSWORD must be set in ${ENV_FILE}" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq quizmind-postgres; then
  echo "ERROR: quizmind-postgres container is not running." >&2
  exit 1
fi

docker exec -u postgres -i quizmind-postgres psql -d postgres \
  -v "user=${DB_USER}" \
  -v "pass=${DB_PASS}" <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'user') THEN
    RAISE EXCEPTION 'Postgres role "%" does not exist', :'user';
  END IF;
END
$$;
ALTER ROLE :"user" WITH PASSWORD :'pass';
SQL

echo "Synced Postgres role password for role \"${DB_USER}\" from ${ENV_FILE}."
