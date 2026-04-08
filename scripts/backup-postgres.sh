#!/usr/bin/env bash
# backup-postgres.sh — Create a compressed Postgres dump of the quizmind database.
#
# Usage:
#   bash scripts/backup-postgres.sh [--output-dir /path/to/backups]
#
# Defaults:
#   Output dir: /opt/quizmind-platform/backups
#   Retention: 7 days (deletes older backups automatically)
#
# Requires: docker (to use pg_dump via the postgres container)
# The container name `quizmind-postgres` must be running.
#
# Schedule example (crontab -e):
#   0 3 * * * bash /opt/quizmind-platform/scripts/backup-postgres.sh >> /var/log/quizmind-backup.log 2>&1

set -euo pipefail

DEPLOY_DIR="/opt/quizmind-platform"
OUTPUT_DIR="${DEPLOY_DIR}/backups"
RETAIN_DAYS=7

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

mkdir -p "${OUTPUT_DIR}"

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_FILE="${OUTPUT_DIR}/quizmind_${TIMESTAMP}.sql.gz"

echo "==> Starting Postgres backup at ${TIMESTAMP}"
echo "==> Output: ${BACKUP_FILE}"

# Run pg_dump inside the running postgres container, pipe through gzip
docker exec quizmind-postgres \
  pg_dump -U postgres quizmind \
  | gzip > "${BACKUP_FILE}"

SIZE="$(du -sh "${BACKUP_FILE}" | cut -f1)"
echo "==> Backup complete: ${BACKUP_FILE} (${SIZE})"

# Remove backups older than RETAIN_DAYS
echo "==> Pruning backups older than ${RETAIN_DAYS} days"
find "${OUTPUT_DIR}" -name "quizmind_*.sql.gz" -mtime "+${RETAIN_DAYS}" -delete
REMAINING=$(find "${OUTPUT_DIR}" -name "quizmind_*.sql.gz" | wc -l)
echo "==> ${REMAINING} backup(s) retained"

echo "==> Done"
