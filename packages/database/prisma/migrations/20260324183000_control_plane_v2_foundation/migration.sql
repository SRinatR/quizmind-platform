-- CreateEnum
CREATE TYPE "CredentialOwnerType" AS ENUM ('platform', 'workspace', 'user');

-- CreateEnum
CREATE TYPE "CredentialValidationStatus" AS ENUM ('pending', 'valid', 'invalid', 'revoked');

-- AlterTable
ALTER TABLE "Workspace"
ADD COLUMN "billingProvider" TEXT,
ADD COLUMN "providerCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerCustomerId" TEXT,
ADD COLUMN "providerPriceId" TEXT,
ADD COLUMN "providerSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "Payment"
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerPaymentId" TEXT;

-- CreateTable
CREATE TABLE "PlanPriceProviderMapping" (
    "id" TEXT NOT NULL,
    "planPriceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPriceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPriceProviderMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionInstallationSession" (
    "id" TEXT NOT NULL,
    "extensionInstallationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ExtensionInstallationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ownerType" "CredentialOwnerType" NOT NULL,
    "ownerId" TEXT,
    "userId" TEXT,
    "workspaceId" TEXT,
    "encryptedSecretJson" JSONB NOT NULL,
    "validationStatus" "CredentialValidationStatus" NOT NULL DEFAULT 'pending',
    "scopesJson" JSONB,
    "metadataJson" JSONB,
    "lastValidatedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_providerInvoiceId_key" ON "Invoice"("providerInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPriceProviderMapping_planPriceId_provider_key" ON "PlanPriceProviderMapping"("planPriceId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPriceProviderMapping_provider_providerPriceId_key" ON "PlanPriceProviderMapping"("provider", "providerPriceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionInstallationSession_tokenHash_key" ON "ExtensionInstallationSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ProviderCredential_provider_ownerType_createdAt_idx" ON "ProviderCredential"("provider", "ownerType", "createdAt");

-- AddForeignKey
ALTER TABLE "PlanPriceProviderMapping" ADD CONSTRAINT "PlanPriceProviderMapping_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionInstallationSession" ADD CONSTRAINT "ExtensionInstallationSession_extensionInstallationId_fkey" FOREIGN KEY ("extensionInstallationId") REFERENCES "ExtensionInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionInstallationSession" ADD CONSTRAINT "ExtensionInstallationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
