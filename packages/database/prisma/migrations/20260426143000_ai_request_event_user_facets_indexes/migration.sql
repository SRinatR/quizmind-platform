CREATE INDEX "ai_request_events_userId_status_occurredAt_idx"
ON "ai_request_events"("userId", "status", "occurredAt");

CREATE INDEX "ai_request_events_userId_requestType_occurredAt_idx"
ON "ai_request_events"("userId", "requestType", "occurredAt");

CREATE INDEX "ai_request_events_userId_model_occurredAt_idx"
ON "ai_request_events"("userId", "model", "occurredAt");
