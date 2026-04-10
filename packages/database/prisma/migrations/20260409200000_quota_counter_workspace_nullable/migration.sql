-- QuotaCounter is no longer written at runtime (quota system removed from active path).
-- Fix: workspaceId becomes nullable. The old workspace-keyed unique index is dropped.
-- A new partial unique index enforces uniqueness for global (NULL-workspaceId) rows only.
--
-- PostgreSQL uniqueness semantics with NULL:
--   A standard UNIQUE index treats each NULL as distinct, so:
--   UNIQUE(NULL, 'ai_requests', '2026-01-01', '2026-01-31')
--   UNIQUE(NULL, 'ai_requests', '2026-01-01', '2026-01-31')
--   ...would NOT be flagged as a conflict — both rows would be inserted.
-- The partial index below (WHERE "workspaceId" IS NULL) uses equality-based matching
-- within the partial subset, so duplicate global rows ARE rejected.

-- Step 1: Drop the composite unique constraint
DROP INDEX "QuotaCounter_workspaceId_key_periodStart_periodEnd_key";

-- Step 2: Alter workspaceId to allow NULL
ALTER TABLE "QuotaCounter" ALTER COLUMN "workspaceId" DROP NOT NULL;

-- Step 3: Add a correct partial unique index for global (NULL) rows only.
-- Within the partial index predicate, rows with workspaceId IS NULL are indexed,
-- and uniqueness is enforced on (key, periodStart, periodEnd) for those rows.
CREATE UNIQUE INDEX "QuotaCounter_key_periodStart_periodEnd_global_key"
  ON "QuotaCounter"("key", "periodStart", "periodEnd")
  WHERE "workspaceId" IS NULL;
