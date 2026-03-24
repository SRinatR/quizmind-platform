-- CreateEnum
CREATE TYPE "AiProviderPolicyScopeType" AS ENUM ('global', 'workspace');

-- CreateEnum
CREATE TYPE "AiAccessPolicyMode" AS ENUM ('platform_only', 'user_key_optional', 'user_key_required', 'admin_approved_user_key', 'enterprise_managed');

-- CreateTable
CREATE TABLE "AiProviderPolicy" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "scopeType" "AiProviderPolicyScopeType" NOT NULL,
    "workspaceId" TEXT,
    "mode" "AiAccessPolicyMode" NOT NULL,
    "allowPlatformManaged" BOOLEAN NOT NULL DEFAULT true,
    "allowBringYourOwnKey" BOOLEAN NOT NULL DEFAULT false,
    "allowDirectProviderMode" BOOLEAN NOT NULL DEFAULT false,
    "allowWorkspaceSharedCredentials" BOOLEAN NOT NULL DEFAULT false,
    "requireAdminApproval" BOOLEAN NOT NULL DEFAULT false,
    "allowVisionOnUserKeys" BOOLEAN NOT NULL DEFAULT false,
    "providersJson" JSONB NOT NULL,
    "allowedModelTagsJson" JSONB,
    "defaultProvider" TEXT,
    "defaultModel" TEXT,
    "reason" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderPolicy_scopeKey_key" ON "AiProviderPolicy"("scopeKey");

-- CreateIndex
CREATE INDEX "AiProviderPolicy_scopeType_workspaceId_idx" ON "AiProviderPolicy"("scopeType", "workspaceId");

-- AddForeignKey
ALTER TABLE "AiProviderPolicy" ADD CONSTRAINT "AiProviderPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderPolicy" ADD CONSTRAINT "AiProviderPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
