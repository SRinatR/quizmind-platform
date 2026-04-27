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

  const objects = [input.metadata, input.payload].filter(Boolean) as Record<string, unknown>[];
  for (const obj of objects) {
    push(obj.aiRequestEventId);
    push(obj.requestId);
    push(obj.aiRequestId);
    if (obj.requestMetadata && typeof obj.requestMetadata === 'object' && !Array.isArray(obj.requestMetadata)) {
      const requestMetadata = obj.requestMetadata as Record<string, unknown>;
      push(requestMetadata.aiRequestEventId);
      push(requestMetadata.requestId);
      push(requestMetadata.aiRequestId);
    }
  }
  push(input.sourceRecordId);

  return Array.from(ids);
}
