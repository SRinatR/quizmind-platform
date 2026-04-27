-- NOTE: these are lightweight source-stream indexes used for backfill ordering and operational lookups.
-- Apply in a maintenance window for very large tables if needed.

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
