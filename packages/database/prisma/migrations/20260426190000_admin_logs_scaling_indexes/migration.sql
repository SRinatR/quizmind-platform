CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_id_idx"
  ON "AuditLog" ("createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_id_idx"
  ON "ActivityLog" ("createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "SecurityEvent_createdAt_id_idx"
  ON "SecurityEvent" ("createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "DomainEvent_createdAt_id_idx"
  ON "DomainEvent" ("createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "SecurityEvent_severity_createdAt_id_idx"
  ON "SecurityEvent" (severity, "createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_id_idx"
  ON "AuditLog" (action, "createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "ActivityLog_eventType_createdAt_id_idx"
  ON "ActivityLog" ("eventType", "createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "SecurityEvent_eventType_createdAt_id_idx"
  ON "SecurityEvent" ("eventType", "createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "DomainEvent_eventType_createdAt_id_idx"
  ON "DomainEvent" ("eventType", "createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "AuditLog_metadataJson_trgm_idx"
  ON "AuditLog" USING gin (LOWER(COALESCE("metadataJson"::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ActivityLog_metadataJson_trgm_idx"
  ON "ActivityLog" USING gin (LOWER(COALESCE("metadataJson"::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "SecurityEvent_metadataJson_trgm_idx"
  ON "SecurityEvent" USING gin (LOWER(COALESCE("metadataJson"::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "DomainEvent_payloadJson_trgm_idx"
  ON "DomainEvent" USING gin (LOWER(COALESCE("payloadJson"::text, '')) gin_trgm_ops);
