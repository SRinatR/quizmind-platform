-- Simplify SystemRole enum from 7 legacy values to a single 'admin' value.
-- All active code already treats any role assignment as admin; this migration
-- makes the stored model match the product model.
--
-- Safe path:
--   1. Drop the unique index so collapsing values cannot violate uniqueness.
--   2. Convert role column to text.
--   3. Collapse all role values to text 'admin'.
--   4. Deduplicate rows per userId (keep oldest by createdAt/id).
--   5. Recreate SystemRole enum as a single-value enum.
--   6. Convert role back to SystemRole.
--   7. Restore the unique index.

-- 1. Remove unique index so duplicate-role rows per user are safe to collapse
DROP INDEX IF EXISTS "UserSystemRole_userId_role_key";

-- 2. Convert enum column to text before assigning the new role value
ALTER TABLE "UserSystemRole"
  ALTER COLUMN role TYPE text USING role::text;

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

-- 5. Rebuild enum with only 'admin' (PostgreSQL cannot DROP VALUE)
DROP TYPE "SystemRole";
CREATE TYPE "SystemRole" AS ENUM ('admin');

-- 6. Convert role back to enum
ALTER TABLE "UserSystemRole"
  ALTER COLUMN role TYPE "SystemRole" USING role::"SystemRole";

-- 7. Restore unique index
CREATE UNIQUE INDEX "UserSystemRole_userId_role_key" ON "UserSystemRole"("userId", "role");
