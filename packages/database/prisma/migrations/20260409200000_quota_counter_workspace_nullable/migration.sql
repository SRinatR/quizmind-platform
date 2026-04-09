-- QuotaCounter is no longer written at runtime (quota system removed from active path).
-- Make workspaceId nullable to match the updated schema, preserving existing rows.

-- Step 1: Drop the composite unique constraint
DROP INDEX "QuotaCounter_workspaceId_key_periodStart_periodEnd_key";

-- Step 2: Alter workspaceId to allow NULL
ALTER TABLE "QuotaCounter" ALTER COLUMN "workspaceId" DROP NOT NULL;

-- Step 3: Re-add unique constraint (NULL-safe — Postgres treats each NULL as distinct,
--         so multiple NULL rows are allowed; existing non-null rows keep their uniqueness)
CREATE UNIQUE INDEX "QuotaCounter_workspaceId_key_periodStart_periodEnd_key"
  ON "QuotaCounter"("workspaceId", "key", "periodStart", "periodEnd");
