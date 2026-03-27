-- CreateTable
CREATE TABLE "ai_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "installationId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "keySource" TEXT NOT NULL DEFAULT 'platform',
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorCode" TEXT,
    "durationMs" INTEGER,
    "requestMetadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_requests_userId_occurredAt_idx" ON "ai_requests"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "ai_requests_workspaceId_occurredAt_idx" ON "ai_requests"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "ai_requests_occurredAt_idx" ON "ai_requests"("occurredAt");

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

