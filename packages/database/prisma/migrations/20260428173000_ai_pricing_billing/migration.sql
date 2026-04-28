ALTER TABLE "WalletLedgerEntry"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "metadataJson" JSONB;

CREATE UNIQUE INDEX "WalletLedgerEntry_idempotencyKey_key" ON "WalletLedgerEntry"("idempotencyKey");

ALTER TABLE "ai_requests"
  ADD COLUMN "providerCostUsd" DOUBLE PRECISION,
  ADD COLUMN "platformFeeUsd" DOUBLE PRECISION,
  ADD COLUMN "chargedCostUsd" DOUBLE PRECISION;

ALTER TABLE "ai_request_events"
  ADD COLUMN "providerCostUsd" DOUBLE PRECISION,
  ADD COLUMN "platformFeeUsd" DOUBLE PRECISION,
  ADD COLUMN "chargedCostUsd" DOUBLE PRECISION,
  ADD COLUMN "chargedCurrency" TEXT,
  ADD COLUMN "chargedAmountMinor" INTEGER,
  ADD COLUMN "pricingSource" TEXT,
  ADD COLUMN "pricingPolicySnapshotJson" JSONB,
  ADD COLUMN "walletLedgerEntryId" TEXT;
