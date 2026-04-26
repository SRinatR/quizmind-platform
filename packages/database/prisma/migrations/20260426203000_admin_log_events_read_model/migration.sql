CREATE TABLE IF NOT EXISTS "AdminLogEvent" (
  "id" TEXT NOT NULL,
  "stream" TEXT NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "severity" "EventSeverity",
  "status" TEXT,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "actorDisplayName" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "category" TEXT,
  "source" TEXT,
  "installationId" TEXT,
  "provider" TEXT,
  "model" TEXT,
  "durationMs" INTEGER,
  "costUsd" DOUBLE PRECISION,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "errorSummary" TEXT,
  "searchText" TEXT,
  "metadataJson" JSONB,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminLogEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminLogEvent_stream_sourceRecordId_key"
  ON "AdminLogEvent" ("stream", "sourceRecordId");

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "AdminLogEvent_occurredAt_id_idx"
  ON "AdminLogEvent" ("occurredAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "AdminLogEvent_stream_occurredAt_id_idx"
  ON "AdminLogEvent" (stream, "occurredAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "AdminLogEvent_category_occurredAt_id_idx"
  ON "AdminLogEvent" (category, "occurredAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "AdminLogEvent_source_occurredAt_id_idx"
  ON "AdminLogEvent" (source, "occurredAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "AdminLogEvent_status_occurredAt_id_idx"
  ON "AdminLogEvent" (status, "occurredAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "AdminLogEvent_severity_occurredAt_id_idx"
  ON "AdminLogEvent" (severity, "occurredAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "AdminLogEvent_actorId_occurredAt_id_idx"
  ON "AdminLogEvent" ("actorId", "occurredAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "AdminLogEvent_eventType_occurredAt_id_idx"
  ON "AdminLogEvent" ("eventType", "occurredAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "AdminLogEvent_searchText_trgm_idx"
  ON "AdminLogEvent" USING gin (LOWER(COALESCE("searchText", '')) gin_trgm_ops);
