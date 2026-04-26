CREATE TABLE IF NOT EXISTS "ai_request_attachments" (
  "id" TEXT NOT NULL,
  "aiRequestEventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "role" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "originalName" TEXT,
  "sizeBytes" INTEGER NOT NULL,
  "blobKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_request_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_request_attachments_aiRequestEventId_idx" ON "ai_request_attachments"("aiRequestEventId");
CREATE INDEX IF NOT EXISTS "ai_request_attachments_expiresAt_deletedAt_idx" ON "ai_request_attachments"("expiresAt", "deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_request_attachments_aiRequestEventId_fkey'
      AND conrelid = 'ai_request_attachments'::regclass
  ) THEN
    ALTER TABLE "ai_request_attachments"
      ADD CONSTRAINT "ai_request_attachments_aiRequestEventId_fkey"
      FOREIGN KEY ("aiRequestEventId") REFERENCES "ai_request_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_request_attachments_userId_fkey'
      AND conrelid = 'ai_request_attachments'::regclass
  ) THEN
    ALTER TABLE "ai_request_attachments"
      ADD CONSTRAINT "ai_request_attachments_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_request_attachments_workspaceId_fkey'
      AND conrelid = 'ai_request_attachments'::regclass
  ) THEN
    ALTER TABLE "ai_request_attachments"
      ADD CONSTRAINT "ai_request_attachments_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
