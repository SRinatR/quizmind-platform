-- Wallet tables are empty in production (0 rows), so no data migration is needed.
-- We drop workspace-based columns/constraints and replace them with user-based ones.

-- Step 1: Drop the workspace FK and unique index on Wallet
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_workspaceId_fkey";
DROP INDEX "Wallet_workspaceId_key";

-- Step 2: Drop the workspace FK on WalletTopUp
ALTER TABLE "WalletTopUp" DROP CONSTRAINT "WalletTopUp_workspaceId_fkey";

-- Step 3: Remove old columns
ALTER TABLE "Wallet" DROP COLUMN "workspaceId";
ALTER TABLE "WalletTopUp" DROP COLUMN "workspaceId";

-- Step 4: Add userId to Wallet (NOT NULL — tables are empty so no default needed)
ALTER TABLE "Wallet" ADD COLUMN "userId" TEXT NOT NULL;

-- Step 5: Add unique index on Wallet.userId
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- Step 6: Add FK from Wallet.userId to User.id
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
