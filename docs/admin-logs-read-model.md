# AdminLogEvent read-model deploy and operations

This runbook documents production-safe rollout and maintenance for the unified `AdminLogEvent` read model.

## Production deploy order

1. **Back up the database** before any schema change.
2. **Deploy migrations** (`prisma migrate deploy` path).
3. **Deploy API + worker** so new writes dual-write to legacy + `AdminLogEvent`.
4. **Run backfill** to fill historical rows.
5. **Run verify-backfill** and confirm missing counts are zero/acceptable.
6. **Optionally run prune in dry-run mode** to preview read-model retention impact.

## Commands

From repository root:

```bash
corepack pnpm --filter @quizmind/api admin-logs:backfill --stream=all
corepack pnpm --filter @quizmind/api admin-logs:verify-backfill
corepack pnpm --filter @quizmind/api admin-logs:prune-read-model --dry-run
```

Repair and targeted replay:

```bash
corepack pnpm --filter @quizmind/api admin-logs:backfill --stream=audit --from=2026-04-01T00:00:00.000Z --to=2026-04-15T00:00:00.000Z
corepack pnpm --filter @quizmind/api admin-logs:backfill --stream=activity --from=2026-04-01T00:00:00.000Z --to=2026-04-15T00:00:00.000Z
corepack pnpm --filter @quizmind/api admin-logs:backfill --stream=security --from=2026-04-01T00:00:00.000Z --to=2026-04-15T00:00:00.000Z
corepack pnpm --filter @quizmind/api admin-logs:backfill --stream=domain --from=2026-04-01T00:00:00.000Z --to=2026-04-15T00:00:00.000Z
corepack pnpm --filter @quizmind/api admin-logs:verify-backfill
```

## Retention safety (read-model only)

Retention applies to `AdminLogEvent` **only** and does not delete from source tables (`AuditLog`, `ActivityLog`, `SecurityEvent`, `DomainEvent`).

Default behavior is non-destructive:

- `ADMIN_LOG_RETENTION_ENABLED=false`
- prune command defaults to dry-run unless `--execute` is passed

Environment knobs:

- `ADMIN_LOG_RETENTION_ENABLED=false`
- `ADMIN_LOG_RETENTION_SENSITIVE_ENABLED=false`
- `ADMIN_LOG_RETENTION_ACTIVITY_DAYS=30`
- `ADMIN_LOG_RETENTION_DOMAIN_DAYS=30`
- `ADMIN_LOG_RETENTION_SYSTEM_DAYS=30`
- `ADMIN_LOG_RETENTION_AUDIT_DAYS=365`
- `ADMIN_LOG_RETENTION_SECURITY_DAYS=365`
- `ADMIN_LOG_RETENTION_ADMIN_DAYS=365`

Sensitive protections:

- audit/security/admin read-model rows are protected unless:
  - `ADMIN_LOG_RETENTION_SENSITIVE_ENABLED=true`, and
  - command includes `--include-sensitive`

Examples:

```bash
# dry-run preview (default)
corepack pnpm --filter @quizmind/api admin-logs:prune-read-model

# explicit dry-run with custom batch size
corepack pnpm --filter @quizmind/api admin-logs:prune-read-model --dry-run --limit=500

# execute deletion for non-sensitive categories only
ADMIN_LOG_RETENTION_ENABLED=true \
corepack pnpm --filter @quizmind/api admin-logs:prune-read-model --execute --limit=1000

# execute deletion including sensitive categories (requires explicit env + flag)
ADMIN_LOG_RETENTION_ENABLED=true \
ADMIN_LOG_RETENTION_SENSITIVE_ENABLED=true \
corepack pnpm --filter @quizmind/api admin-logs:prune-read-model --execute --include-sensitive --limit=1000
```

## Index maintenance guidance

Prisma migrations intentionally use regular `CREATE INDEX IF NOT EXISTS` for fresh installs and smaller databases.

For large production databases where lock minimization is required, use:

- `packages/database/prisma/manual-maintenance/admin-log-events-concurrent-indexes.sql`

Warnings:

- Do **not** run manual maintenance SQL via `prisma migrate deploy`.
- Execute statements manually in `psql`.
- `CREATE INDEX CONCURRENTLY` statements must run outside transaction blocks.
