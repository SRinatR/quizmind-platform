-- CreateTable
CREATE TABLE "SupportImpersonationSession" (
    "id" TEXT NOT NULL,
    "supportActorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SupportImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportImpersonationSession_supportActorId_createdAt_idx" ON "SupportImpersonationSession"("supportActorId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportImpersonationSession_targetUserId_createdAt_idx" ON "SupportImpersonationSession"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportImpersonationSession_workspaceId_createdAt_idx" ON "SupportImpersonationSession"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportImpersonationSession" ADD CONSTRAINT "SupportImpersonationSession_supportActorId_fkey" FOREIGN KEY ("supportActorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportImpersonationSession" ADD CONSTRAINT "SupportImpersonationSession_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportImpersonationSession" ADD CONSTRAINT "SupportImpersonationSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
