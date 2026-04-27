import { type AdminLogEntry } from '@quizmind/contracts';

export function shortId(value?: string | null): string {
  if (!value) return '—';
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function formatCost(usd?: number): string {
  if (usd === undefined || usd === null) return '—';
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(4)}`;
}

export function actorLabel(entry: AdminLogEntry): string {
  return entry.actor?.displayName ?? entry.actor?.email ?? shortId(entry.actor?.id) ?? '—';
}

export function targetLabel(entry: AdminLogEntry): string {
  if (entry.installationId) return `Installation ${shortId(entry.installationId)}`;
  const requestId = typeof entry.metadata?.requestId === 'string' ? entry.metadata.requestId : undefined;
  if (entry.targetType === 'ai_request' || entry.category === 'ai') {
    const fallbackRequestId = requestId ?? entry.targetId;
    return fallbackRequestId ? `AI request ${shortId(fallbackRequestId)}` : 'AI request';
  }
  if (entry.provider && entry.model) return `${entry.provider} / ${entry.model}`;
  if (entry.provider) return entry.provider;
  if (entry.targetType === 'user') {
    const targetDisplayName = typeof entry.metadata?.targetDisplayName === 'string' ? entry.metadata.targetDisplayName : undefined;
    const targetEmail = typeof entry.metadata?.targetEmail === 'string' ? entry.metadata.targetEmail : undefined;
    const readable = targetDisplayName ?? targetEmail;
    return readable ? `User ${readable}` : `User ${entry.targetId ? shortId(entry.targetId) : ''}`.trim();
  }
  if (entry.targetType && entry.targetId) return `${entry.targetType} ${shortId(entry.targetId)}`;
  if (entry.targetType) return entry.targetType;
  if (entry.targetId) return shortId(entry.targetId);
  return '—';
}
