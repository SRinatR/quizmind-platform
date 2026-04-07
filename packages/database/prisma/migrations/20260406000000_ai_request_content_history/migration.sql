-- AlterTable
ALTER TABLE "ai_requests" ADD COLUMN "requestType" TEXT,
ADD COLUMN "promptContentJson" JSONB,
ADD COLUMN "responseContentJson" JSONB,
ADD COLUMN "fileMetadataJson" JSONB,
ADD COLUMN "contentExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ai_requests_contentExpiresAt_idx" ON "ai_requests"("contentExpiresAt");
