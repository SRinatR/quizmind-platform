-- CreateTable
CREATE TABLE "UserBillingOverride" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "aiPlatformFeeExempt" BOOLEAN NOT NULL DEFAULT false,
  "aiMarkupPercentOverride" DOUBLE PRECISION,
  "reason" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserBillingOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminWalletAdjustmentBatch" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetCount" INTEGER NOT NULL,
  "amountKopecks" INTEGER NOT NULL,
  "direction" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminWalletAdjustmentBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBillingOverride_userId_key" ON "UserBillingOverride"("userId");
CREATE UNIQUE INDEX "AdminWalletAdjustmentBatch_idempotencyKey_key" ON "AdminWalletAdjustmentBatch"("idempotencyKey");

ALTER TABLE "UserBillingOverride" ADD CONSTRAINT "UserBillingOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminWalletAdjustmentBatch" ADD CONSTRAINT "AdminWalletAdjustmentBatch_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
