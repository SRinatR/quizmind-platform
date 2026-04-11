-- Production repair: SystemRole enum cleanup
--
-- USE CASE
-- --------
-- Run this ONLY on production databases where:
--   - Migration 20260411000000_simplify_system_role_enum was marked as applied
--     in Prisma (_prisma_migrations) but was NOT fully executed against the DB.
--   - The DB still contains legacy SystemRole enum values (super_admin,
--     platform_admin, billing_admin, support_admin, security_admin, ops_admin,
--     content_admin) and/or duplicate UserSystemRole rows per user.
--
-- This script is IDEMPOTENT: safe to run more than once on the same database.
--
-- WHAT IT DOES
-- ------------
--   1. Drops the unique index (if present) to allow safe deduplication.
--   2. Adds the 'admin' enum value if it is missing.
--   3. Collapses all legacy role values to 'admin'.
--   4. Deletes duplicate rows, keeping the oldest per user.
--   5. Rebuilds the enum type with only 'admin' via a text round-trip.
--   6. Restores (or leaves in place) the unique index.
--
-- DO NOT run this on a fresh database that has never had the old enum values;
-- it is safe either way but unnecessary.

BEGIN;

-- 1. Drop unique index to allow deduplication without constraint violations
DROP INDEX IF EXISTS "UserSystemRole_userId_role_key";

-- 2. Add 'admin' value to enum if not present (covers partial-apply case)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SystemRole')
  ) THEN
    ALTER TYPE "SystemRole" ADD VALUE 'admin';
  END IF;
END
$$;

-- 3. Commit the ADD VALUE before using it in UPDATE (required in PostgreSQL)
--    We use a savepoint trick: ADD VALUE cannot be used in the same tx on PG < 14
--    when the type already exists.  The DO block above committed implicitly in
--    older versions; this COMMIT makes it safe for both old and new PG versions.
COMMIT;
BEGIN;

-- 4. Collapse all legacy role values to 'admin'
UPDATE "UserSystemRole" SET role = 'admin'::text::"SystemRole"
WHERE role::text <> 'admin';

-- 5. Remove duplicate rows per userId; keep the oldest
DELETE FROM "UserSystemRole"
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC, id ASC) AS rn
    FROM "UserSystemRole"
  ) ranked
  WHERE rn > 1
);

-- 6. Rebuild the enum to contain only 'admin'
--    Skip if already done (all enum values are already just 'admin').
DO $$
DECLARE
  extra_values INT;
BEGIN
  SELECT COUNT(*) INTO extra_values
  FROM pg_enum
  WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SystemRole')
    AND enumlabel <> 'admin';

  IF extra_values > 0 THEN
    -- Round-trip through text to drop old values
    ALTER TABLE "UserSystemRole" ALTER COLUMN role TYPE text;
    DROP TYPE "SystemRole";
    CREATE TYPE "SystemRole" AS ENUM ('admin');
    ALTER TABLE "UserSystemRole" ALTER COLUMN role TYPE "SystemRole" USING role::"SystemRole";
  END IF;
END
$$;

-- 7. Restore unique constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'UserSystemRole'
      AND indexname = 'UserSystemRole_userId_role_key'
  ) THEN
    CREATE UNIQUE INDEX "UserSystemRole_userId_role_key" ON "UserSystemRole"("userId", "role");
  END IF;
END
$$;

COMMIT;

-- Verify
SELECT
  (SELECT COUNT(DISTINCT enumlabel) FROM pg_enum
   WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SystemRole')
     AND enumlabel <> 'admin') AS legacy_enum_values_remaining,
  (SELECT COUNT(*) FROM (
     SELECT "userId", COUNT(*) AS c FROM "UserSystemRole" GROUP BY "userId" HAVING COUNT(*) > 1
   ) dup) AS duplicate_user_rows_remaining;
-- Both columns should be 0 after a successful repair.
