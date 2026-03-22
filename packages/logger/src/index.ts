import { type AuditEvent } from '@quizmind/contracts';

export const logCategories = ['audit', 'activity', 'domain', 'system', 'security', 'extension'] as const;
export type LogCategory = (typeof logCategories)[number];

export interface StructuredLogEvent extends AuditEvent {
  category: LogCategory;
  severity: 'debug' | 'info' | 'warn' | 'error';
  status?: 'success' | 'failure';
}

export function createLogEvent(event: StructuredLogEvent): StructuredLogEvent {
  return {
    ...event,
    metadata: event.metadata ?? {},
  };
}

export function createAuditLogEvent(event: Omit<StructuredLogEvent, 'category'>): StructuredLogEvent {
  return createLogEvent({
    ...event,
    category: 'audit',
  });
}

export function createSecurityLogEvent(event: Omit<StructuredLogEvent, 'category'>): StructuredLogEvent {
  return createLogEvent({
    ...event,
    category: 'security',
  });
}

export function redactSecrets(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (/(token|secret|password|key)/i.test(key)) {
        return [key, '***redacted***'];
      }

      return [key, value];
    }),
  );
}
