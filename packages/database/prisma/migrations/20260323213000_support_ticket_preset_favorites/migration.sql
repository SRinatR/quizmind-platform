CREATE TABLE "SupportTicketPresetFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "presetKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketPresetFavorite_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SupportTicketPresetFavorite"
ADD CONSTRAINT "SupportTicketPresetFavorite_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SupportTicketPresetFavorite_userId_presetKey_key"
ON "SupportTicketPresetFavorite"("userId", "presetKey");

CREATE INDEX "SupportTicketPresetFavorite_userId_createdAt_idx"
ON "SupportTicketPresetFavorite"("userId", "createdAt");
