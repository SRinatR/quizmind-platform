-- Simplify SystemRole enum from 7 legacy values to a single 'admin' value.
-- All active code already treats any role assignment as admin; this migration
-- makes the stored model match the product model.
--
-- Safe path:
--   1. Drop the unique constraint first so that collapsing multiple legacy
--      role rows per user to 'admin' cannot hit a duplicate key violation.
--   2. Add 'admin' to the existing enum (idempotent in fresh envs).
--   3. Update all rows to 'admin'.
--   4. Delete duplicate rows, keeping one per userId.
--   5. Rebuild the enum as a single-value type via text round-trip.
--   6. Restore the unique constraint.

-- 1. Remove the unique index so duplicate-role rows per user are safe to update
DROP INDEX IF EXISTS "UserSystemRole_userId_role_key";

-- 2. Add the new 'admin' value (safe; ADD VALUE is idempotent on re-run in PG 12+,
--    but to be explicit we guard with a DO block)
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

-- 3. Collapse every legacy role value to 'admin'
UPDATE "UserSystemRole" SET role = 'admin';

-- 4. Deduplicate: keep the oldest row per userId, delete the rest
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

-- 5. Rebuild enum with only 'admin' (PostgreSQL cannot DROP VALUE, so use text round-trip)
ALTER TABLE "UserSystemRole" ALTER COLUMN role TYPE text;
DROP TYPE "SystemRole";
CREATE TYPE "SystemRole" AS ENUM ('admin');
ALTER TABLE "UserSystemRole" ALTER COLUMN role TYPE "SystemRole" USING role::"SystemRole";

-- 6. Restore the unique constraint
CREATE UNIQUE INDEX "UserSystemRole_userId_role_key" ON "UserSystemRole"("userId", "role");
