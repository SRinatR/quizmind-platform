ALTER TABLE "SupportImpersonationSession"
ADD COLUMN "supportTicketId" TEXT,
ADD COLUMN "operatorNote" TEXT;

CREATE INDEX "SupportImpersonationSession_supportTicketId_createdAt_idx"
ON "SupportImpersonationSession"("supportTicketId", "createdAt");

ALTER TABLE "SupportImpersonationSession"
ADD CONSTRAINT "SupportImpersonationSession_supportTicketId_fkey"
FOREIGN KEY ("supportTicketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
