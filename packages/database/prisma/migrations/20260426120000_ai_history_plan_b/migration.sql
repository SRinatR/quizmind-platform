CREATE TABLE "ai_request_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "installationId" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "modelDisplayName" TEXT,
  "requestType" TEXT NOT NULL,
  "keySource" TEXT NOT NULL DEFAULT 'platform',
  "status" TEXT NOT NULL DEFAULT 'success',
  "errorCode" TEXT,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DOUBLE PRECISION,
  "durationMs" INTEGER,
  "promptExcerpt" TEXT,
  "responseExcerpt" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_request_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_request_contents" (
  "id" TEXT NOT NULL,
  "aiRequestEventId" TEXT NOT NULL,
  "promptBlobKey" TEXT,
  "responseBlobKey" TEXT,
  "fileBlobKey" TEXT,
  "fileMetadataJson" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_request_contents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_usage_daily_rollups" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "requestType" TEXT,
  "model" TEXT NOT NULL,
  "modelDisplayName" TEXT,
  "status" TEXT NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_daily_rollups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_request_events_userId_occurredAt_idx" ON "ai_request_events"("userId", "occurredAt");
CREATE INDEX "ai_request_events_workspaceId_occurredAt_idx" ON "ai_request_events"("workspaceId", "occurredAt");
CREATE INDEX "ai_request_events_occurredAt_idx" ON "ai_request_events"("occurredAt");
CREATE INDEX "ai_request_contents_expiresAt_deletedAt_idx" ON "ai_request_contents"("expiresAt", "deletedAt");
CREATE INDEX "ai_usage_daily_rollups_userId_date_idx" ON "ai_usage_daily_rollups"("userId", "date");

CREATE UNIQUE INDEX "ai_request_contents_aiRequestEventId_key" ON "ai_request_contents"("aiRequestEventId");
CREATE UNIQUE INDEX "ai_usage_daily_rollups_userId_date_model_requestType_status_key"
ON "ai_usage_daily_rollups"("userId", "date", "model", "requestType", "status");

ALTER TABLE "ai_request_events"
ADD CONSTRAINT "ai_request_events_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_request_events"
ADD CONSTRAINT "ai_request_events_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_request_contents"
ADD CONSTRAINT "ai_request_contents_aiRequestEventId_fkey"
FOREIGN KEY ("aiRequestEventId") REFERENCES "ai_request_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage_daily_rollups"
ADD CONSTRAINT "ai_usage_daily_rollups_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
