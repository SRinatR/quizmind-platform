export function collectAdminAiRequestCandidateIds(input: {
  targetType?: string | null;
  targetId?: string | null;
  sourceRecordId?: string | null;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}): string[] {
  const ids = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim().length > 0) ids.add(value.trim());
  };

  if (input.targetType === 'ai_request') push(input.targetId);
  push(input.sourceRecordId);

  const objects = [input.metadata, input.payload].filter(Boolean) as Record<string, unknown>[];
  for (const obj of objects) {
    push(obj.requestId);
    push(obj.aiRequestId);
    push(obj.aiRequestEventId);
  }

  return Array.from(ids);
}
