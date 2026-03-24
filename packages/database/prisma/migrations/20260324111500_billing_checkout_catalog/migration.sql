ALTER TABLE "PlanPrice"
ADD COLUMN "stripePriceId" TEXT;

ALTER TABLE "Subscription"
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripePriceId" TEXT,
ADD COLUMN "trialStartAt" TIMESTAMP(3);

UPDATE "Subscription"
SET "stripeCustomerId" = "Workspace"."stripeCustomerId"
FROM "Workspace"
WHERE "Workspace"."id" = "Subscription"."workspaceId"
  AND "Subscription"."stripeCustomerId" IS NULL
  AND "Workspace"."stripeCustomerId" IS NOT NULL;

UPDATE "Subscription"
SET "trialStartAt" = "currentPeriodStart"
WHERE "trialStartAt" IS NULL
  AND "status" = 'trialing'
  AND "currentPeriodStart" IS NOT NULL;

CREATE UNIQUE INDEX "PlanPrice_stripePriceId_key" ON "PlanPrice"("stripePriceId");
CREATE UNIQUE INDEX "PlanPrice_planId_intervalCode_currency_key" ON "PlanPrice"("planId", "intervalCode", "currency");
