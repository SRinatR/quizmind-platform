-- Admin users directory scalability indexes
-- NOTE:
-- Prisma Migrate (7.5.0 in this repo) does not support a per-migration SQL marker
-- to opt out of transaction wrapping for PostgreSQL migrations in this setup.
-- Because of that, CREATE INDEX CONCURRENTLY is not safe here for `migrate deploy`.
-- Run this migration while the DB is still small or during a maintenance window.
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

CREATE INDEX IF NOT EXISTS "UserSystemRole_role_userId_idx"
  ON "UserSystemRole" ("role", "userId");

CREATE INDEX IF NOT EXISTS "User_email_lower_trgm_idx"
  ON "User" USING GIN (LOWER("email") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_displayName_lower_trgm_idx"
  ON "User" USING GIN (LOWER(COALESCE("displayName", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_email_trgm_idx"
  ON "User" USING GIN ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_displayName_trgm_idx"
  ON "User" USING GIN ("displayName" gin_trgm_ops);
