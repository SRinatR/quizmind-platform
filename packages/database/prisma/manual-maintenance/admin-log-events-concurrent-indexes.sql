-- Manual maintenance SQL for large production databases.
-- Do not run this file through `prisma migrate deploy`.
-- Run manually in psql during a maintenance window when migration lock time is a concern.
-- IMPORTANT: each CREATE INDEX CONCURRENTLY statement must run outside a transaction block.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_occurredAt_id_idx"
  ON "AdminLogEvent" ("occurredAt" DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_stream_occurredAt_id_idx"
  ON "AdminLogEvent" (stream, "occurredAt" DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_category_occurredAt_id_idx"
  ON "AdminLogEvent" (category, "occurredAt" DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_source_occurredAt_id_idx"
  ON "AdminLogEvent" (source, "occurredAt" DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_status_occurredAt_id_idx"
  ON "AdminLogEvent" (status, "occurredAt" DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_severity_occurredAt_id_idx"
  ON "AdminLogEvent" (severity, "occurredAt" DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_actorId_occurredAt_id_idx"
  ON "AdminLogEvent" ("actorId", "occurredAt" DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_eventType_occurredAt_id_idx"
  ON "AdminLogEvent" ("eventType", "occurredAt" DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdminLogEvent_searchText_trgm_idx"
  ON "AdminLogEvent" USING gin ("searchText" gin_trgm_ops);
