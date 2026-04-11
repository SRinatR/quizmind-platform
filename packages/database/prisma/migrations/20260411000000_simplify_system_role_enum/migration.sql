-- Simplify SystemRole enum from 7 legacy values to a single 'admin' value.
-- All active code already treats any role assignment as admin; this migration
-- makes the stored model match the product model.

-- 1. Add the new 'admin' value to the existing enum
ALTER TYPE "SystemRole" ADD VALUE 'admin';

-- 2. Migrate all existing rows to the new unified value
UPDATE "UserSystemRole" SET role = 'admin';

-- 3. Rebuild the enum with only 'admin':
--    PostgreSQL does not support DROP VALUE, so we replace the column type via text cast.
ALTER TABLE "UserSystemRole" ALTER COLUMN role TYPE text;
DROP TYPE "SystemRole";
CREATE TYPE "SystemRole" AS ENUM ('admin');
ALTER TABLE "UserSystemRole" ALTER COLUMN role TYPE "SystemRole" USING role::"SystemRole";
