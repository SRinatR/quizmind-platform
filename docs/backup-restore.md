# Backup & Restore

## Overview

Backups are handled at the Postgres level via `scripts/backup-postgres.sh`. The script uses `pg_dump` inside the running Docker container and produces a gzip-compressed SQL dump.

**Important:** This repo provides a backup script and schedule example. Offsite storage (S3, Backblaze, rsync to a second server) requires additional infrastructure configuration outside the repo. Local backups alone are not sufficient for disaster recovery.

---

## Creating a Backup

Run manually on the VPS:

```bash
bash /opt/quizmind-platform/scripts/backup-postgres.sh
# Output: /opt/quizmind-platform/backups/quizmind_<TIMESTAMP>.sql.gz
```

With a custom output directory:

```bash
bash /opt/quizmind-platform/scripts/backup-postgres.sh --output-dir /mnt/backups
```

Backups older than 7 days are automatically deleted.

---

## Scheduling Backups (cron)

Add this to the VPS crontab (`crontab -e`):

```cron
# Daily backup at 03:00 UTC
0 3 * * * bash /opt/quizmind-platform/scripts/backup-postgres.sh >> /var/log/quizmind-backup.log 2>&1
```

Check the log after the first run:

```bash
tail -20 /var/log/quizmind-backup.log
```

---

## Offsite Backup (manual step required)

After local backups are working, sync them offsite. Examples:

**rsync to a second server:**
```bash
rsync -avz /opt/quizmind-platform/backups/ user@backup-host:/backups/quizmind/
```

**Upload to S3-compatible storage:**
```bash
aws s3 sync /opt/quizmind-platform/backups/ s3://your-bucket/quizmind-backups/ \
  --storage-class STANDARD_IA
```

**Rclone (any cloud provider):**
```bash
rclone sync /opt/quizmind-platform/backups/ remote:quizmind-backups
```

These steps require credentials and infrastructure setup on the VPS that is outside the scope of this repo.

---

## Restoring from a Backup

### 1. Stop the app to prevent writes during restore

```bash
cd /opt/quizmind-platform
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker stop api worker
```

### 2. Drop and recreate the database

```bash
docker exec -it quizmind-postgres psql -U postgres -c "DROP DATABASE quizmind;"
docker exec -it quizmind-postgres psql -U postgres -c "CREATE DATABASE quizmind;"
```

### 3. Restore from the backup file

```bash
BACKUP_FILE=/opt/quizmind-platform/backups/quizmind_<TIMESTAMP>.sql.gz

gunzip -c "${BACKUP_FILE}" | docker exec -i quizmind-postgres psql -U postgres quizmind
```

### 4. Restart the app

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker up -d
```

### 5. Verify

```bash
curl -s https://ods.uz/api/health | jq .
```

---

## Redis

Redis data is persisted via Docker volume (`quizmind_redis_data`) with AOF enabled (`appendonly yes`). It is **not** included in the Postgres backup.

For Redis backup:

```bash
# Copy the current RDB snapshot from the container
docker exec quizmind-redis redis-cli SAVE
docker cp quizmind-redis:/data/dump.rdb /opt/quizmind-platform/backups/redis_$(date +%Y%m%dT%H%M%SZ).rdb
```

Redis data is generally recoverable since BullMQ job payloads are also persisted in Postgres (domain events, audit logs). A Redis failure typically only loses in-flight queue jobs.

---

## Backup File Inventory

List current backups:

```bash
ls -lh /opt/quizmind-platform/backups/
```

Check backup integrity (verify gunzip succeeds):

```bash
gunzip -t /opt/quizmind-platform/backups/quizmind_<TIMESTAMP>.sql.gz && echo "OK"
```
