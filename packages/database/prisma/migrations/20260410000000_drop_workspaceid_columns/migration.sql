-- Drop workspaceId columns that are no longer used in active source code.
-- All writes/reads of these fields have been removed in prior code passes.

-- 1. Drop explicit indexes that reference workspaceId columns

-- AiProviderPolicy: replace @@index([scopeType, workspaceId]) with @@index([scopeType])
DROP INDEX "AiProviderPolicy_scopeType_workspaceId_idx";
CREATE INDEX "AiProviderPolicy_scopeType_idx" ON "AiProviderPolicy"("scopeType");

-- SupportImpersonationSession: @@index([workspaceId, createdAt])
DROP INDEX "SupportImpersonationSession_workspaceId_createdAt_idx";

-- QuotaCounter: partial unique index from previous migration
DROP INDEX "QuotaCounter_key_periodStart_periodEnd_global_key";

-- 2. Drop FK constraints (must precede column drops)

ALTER TABLE "ExtensionInstallation"       DROP CONSTRAINT "ExtensionInstallation_workspaceId_fkey";
ALTER TABLE "AiProviderPolicy"            DROP CONSTRAINT "AiProviderPolicy_workspaceId_fkey";
ALTER TABLE "ProviderCredential"          DROP CONSTRAINT "ProviderCredential_workspaceId_fkey";
ALTER TABLE "AuditLog"                    DROP CONSTRAINT "AuditLog_workspaceId_fkey";
ALTER TABLE "ActivityLog"                 DROP CONSTRAINT "ActivityLog_workspaceId_fkey";
ALTER TABLE "SecurityEvent"              DROP CONSTRAINT "SecurityEvent_workspaceId_fkey";
ALTER TABLE "DomainEvent"                 DROP CONSTRAINT "DomainEvent_workspaceId_fkey";
ALTER TABLE "RemoteConfigVersion"         DROP CONSTRAINT "RemoteConfigVersion_workspaceId_fkey";
ALTER TABLE "SupportImpersonationSession" DROP CONSTRAINT "SupportImpersonationSession_workspaceId_fkey";

-- 3. Drop the columns

ALTER TABLE "ExtensionInstallation"       DROP COLUMN "workspaceId";
ALTER TABLE "AiProviderPolicy"            DROP COLUMN "workspaceId";
ALTER TABLE "ProviderCredential"          DROP COLUMN "workspaceId";
ALTER TABLE "AuditLog"                    DROP COLUMN "workspaceId";
ALTER TABLE "ActivityLog"                 DROP COLUMN "workspaceId";
ALTER TABLE "SecurityEvent"              DROP COLUMN "workspaceId";
ALTER TABLE "DomainEvent"                 DROP COLUMN "workspaceId";
ALTER TABLE "RemoteConfigVersion"         DROP COLUMN "workspaceId";
ALTER TABLE "SupportImpersonationSession" DROP COLUMN "workspaceId";
ALTER TABLE "QuotaCounter"                DROP COLUMN "workspaceId";

-- 4. Add the new simple unique index on QuotaCounter now that workspaceId is gone
CREATE UNIQUE INDEX "QuotaCounter_key_periodStart_periodEnd_key"
  ON "QuotaCounter"("key", "periodStart", "periodEnd");
