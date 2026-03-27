import { type AdminLogEntry } from '@quizmind/contracts';

export const extensionLifecycleFilterDefinitions = [
  {
    eventType: 'extension.bootstrap_refresh_failed',
    label: 'Bootstrap failures',
  },
  {
    eventType: 'extension.installation_reconnect_requested',
    label: 'Reconnect requested',
  },
  {
    eventType: 'extension.installation_reconnected',
    label: 'Reconnected',
  },
  {
    eventType: 'extension.installation_session_revoked',
    label: 'Session revoked',
  },
  {
    eventType: 'extension.installation_session_rotated',
    label: 'Session rotated',
  },
  {
    eventType: 'extension.runtime_error',
    label: 'Runtime errors',
  },
] as const;

export type ExtensionLifecycleEventType = (typeof extensionLifecycleFilterDefinitions)[number]['eventType'];

const extensionLifecycleEventTypeSet = new Set<string>(
  extensionLifecycleFilterDefinitions.map((definition) => definition.eventType),
);

export interface ExtensionLifecycleSummary {
  total: number;
  byEventType: Record<ExtensionLifecycleEventType, number>;
}

export function isExtensionLifecycleEventType(eventType: string): eventType is ExtensionLifecycleEventType {
  return extensionLifecycleEventTypeSet.has(eventType);
}

export function summarizeExtensionLifecycleEvents(items: AdminLogEntry[]): ExtensionLifecycleSummary {
  const byEventType: ExtensionLifecycleSummary['byEventType'] = {
    'extension.bootstrap_refresh_failed': 0,
    'extension.installation_reconnect_requested': 0,
    'extension.installation_reconnected': 0,
    'extension.installation_session_revoked': 0,
    'extension.installation_session_rotated': 0,
    'extension.runtime_error': 0,
  };
  let total = 0;

  for (const item of items) {
    if (!isExtensionLifecycleEventType(item.eventType)) {
      continue;
    }

    byEventType[item.eventType] += 1;
    total += 1;
  }

  return {
    total,
    byEventType,
  };
}

export function buildExtensionLifecycleSearch(eventType?: ExtensionLifecycleEventType): string {
  return eventType ?? 'extension.';
}
