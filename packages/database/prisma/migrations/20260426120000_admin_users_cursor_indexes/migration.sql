-- Admin users directory scalability indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "User_createdAt_id_idx"
  ON "User" ("createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "User_createdAt_id_asc_idx"
  ON "User" ("createdAt" ASC, "id" ASC);

CREATE INDEX IF NOT EXISTS "User_lastLoginAt_id_idx"
  ON "User" ("lastLoginAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "User_email_id_idx"
  ON "User" ("email" ASC, "id" ASC);

CREATE INDEX IF NOT EXISTS "User_suspendedAt_idx"
  ON "User" ("suspendedAt");

CREATE INDEX IF NOT EXISTS "User_emailVerifiedAt_idx"
  ON "User" ("emailVerifiedAt");

CREATE INDEX IF NOT EXISTS "UserSystemRole_userId_role_idx"
  ON "UserSystemRole" ("userId", "role");

CREATE INDEX IF NOT EXISTS "User_email_lower_trgm_idx"
  ON "User" USING GIN (LOWER("email") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_displayName_lower_trgm_idx"
  ON "User" USING GIN (LOWER(COALESCE("displayName", '')) gin_trgm_ops);
