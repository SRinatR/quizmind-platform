-- Drop heavy JSON content columns (content moves to local blob storage)
ALTER TABLE "ai_requests" DROP COLUMN IF EXISTS "promptContentJson";
ALTER TABLE "ai_requests" DROP COLUMN IF EXISTS "responseContentJson";

-- Rename contentExpiresAt → expiresAt
ALTER TABLE "ai_requests" RENAME COLUMN "contentExpiresAt" TO "expiresAt";

-- Add cost column and keep fileMetadataJson for lightweight file info
ALTER TABLE "ai_requests" ADD COLUMN IF NOT EXISTS "estimatedCostUsd" DOUBLE PRECISION;

-- Recreate index under new name
DROP INDEX IF EXISTS "ai_requests_contentExpiresAt_idx";
CREATE INDEX IF NOT EXISTS "ai_requests_expiresAt_idx" ON "ai_requests"("expiresAt");
