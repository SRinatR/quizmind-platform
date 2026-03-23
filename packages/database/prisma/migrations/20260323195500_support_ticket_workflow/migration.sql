ALTER TABLE "SupportTicket"
ADD COLUMN "assignedToId" TEXT,
ADD COLUMN "handoffNote" TEXT;

ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_assignedToId_fkey"
FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "SupportTicket_status_updatedAt_idx"
ON "SupportTicket"("status", "updatedAt");

CREATE INDEX "SupportTicket_assignedToId_updatedAt_idx"
ON "SupportTicket"("assignedToId", "updatedAt");
