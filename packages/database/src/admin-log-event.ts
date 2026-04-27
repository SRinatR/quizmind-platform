import type { EventSeverity, Prisma } from './generated/prisma/client';

export type LegacyAdminLogStream = 'audit' | 'activity' | 'security' | 'domain';

export interface BuildAdminLogEventInput {
  stream: LegacyAdminLogStream;
  sourceRecordId: string;
  eventType: string;
  occurredAt: Date;
  actorId?: string | null;
  severity?: EventSeverity | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

function toText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toUsageNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return toNumber((value as Record<string, unknown>)[key]);
}

function deriveCategory(eventType: string, stream: LegacyAdminLogStream, metadata?: Record<string, unknown>): string {
  const et = eventType.toLowerCase();
  if (et.startsWith('auth.') || et.includes('login') || et.includes('password') || et.includes('session') || et.includes('.mfa') || et.includes('.otp')) {
    return 'auth';
  }
  if (et.startsWith('extension.') || et.includes('installation') || et.includes('bootstrap')) {
    return 'extension';
  }
  if (et.startsWith('ai.') || et.includes('quiz_answer') || et.includes('ai_request') || et.includes('proxy_request') || toText(metadata?.provider) || toText(metadata?.model)) {
    return 'ai';
  }
  if (stream === 'audit' || et.startsWith('admin.') || et.includes('support.') || et.includes('impersonation')) {
    return 'admin';
  }
  return 'system';
}

function deriveSource(eventType: string, metadata?: Record<string, unknown>): string | undefined {
  const sourceRaw = toText(metadata?.source) ?? toText(metadata?.origin) ?? toText(metadata?.platform) ?? toText(metadata?.client) ?? toText(metadata?.requestSource);
  if (sourceRaw) {
    const value = sourceRaw.toLowerCase();
    if (['web', 'web_app', 'dashboard'].includes(value)) return 'web';
    if (['extension', 'content_script', 'extension_popup'].includes(value)) return 'extension';
    if (value === 'api') return 'api';
    if (['worker', 'queue'].includes(value)) return 'worker';
    if (value === 'webhook') return 'webhook';
  }
  const et = eventType.toLowerCase();
  if (et.startsWith('ai.proxy.')) return 'api';
  if (et.startsWith('extension.')) return 'extension';
  if (et.startsWith('webhook.') || et.includes('webhook_')) return 'webhook';
  if (
    et.startsWith('admin.')
    || et.startsWith('support.')
    || et.includes('impersonation')
    || et.includes('provider_policy')
    || et.includes('provider_credential')
  ) {
    return 'web';
  }
  if (et.startsWith('worker.') || et.startsWith('queue.') || et.includes('.worker_') || et.includes('.job_')) return 'worker';
  return undefined;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => `${chunk.charAt(0).toUpperCase()}${chunk.slice(1)}`)
    .join(' ');
}

function deriveSummary(eventType: string): string {
  const et = eventType.toLowerCase();
  const explicit: Record<string, string> = {
    'ai.proxy.completed': 'AI request completed',
    'ai.proxy.failed': 'AI request failed',
    'ai.proxy.user_key_used': 'User API key used',
    'ai.proxy.user_key_failed': 'User API key failed',
    'extension.installation_self_disconnected': 'Extension disconnected',
    'extension.installation_session_revoked': 'Extension session revoked',
    'auth.login_success': 'Login successful',
    'auth.login_failed': 'Login failed',
    'auth.password_reset_requested': 'Password reset requested',
    'auth.password_reset_completed': 'Password reset completed',
    'auth.session_revoked': 'Session revoked',
    'auth.session_created': 'Session created',
  };
  const explicitMatch = explicit[et];
  if (explicitMatch) return explicitMatch;

  if (et.includes('provider_credential')) return 'Provider credential updated';
  if (et.includes('provider_policy')) return 'Provider policy updated';
  if (et.includes('support.') || et.includes('impersonation')) return 'Support action recorded';
  if (et.startsWith('admin.')) return 'Admin action recorded';
  if (et.includes('login')) return et.includes('failed') ? 'Login failed' : 'Login successful';
  if (et.includes('password')) return 'Password event recorded';
  if (et.includes('session')) return 'Session event recorded';
  return toTitleCase(eventType.replace(/[._-]+/g, ' '));
}

export function buildAdminLogEventCreateInput(input: BuildAdminLogEventInput): Prisma.AdminLogEventCreateInput {
  const metadata = input.metadata;
  const payload = input.payload;
  const rich = metadata ?? payload;
  const summary = toText((rich as Record<string, unknown> | undefined)?.summary) ??
    deriveSummary(input.eventType);
  const statusCandidate = toText((rich as Record<string, unknown> | undefined)?.status);
  const severityCandidate = toText((rich as Record<string, unknown> | undefined)?.severity);
  const severity = input.severity ?? (severityCandidate === 'debug' || severityCandidate === 'info' || severityCandidate === 'warn' || severityCandidate === 'error'
    ? (severityCandidate as EventSeverity)
    : undefined);
  const status = statusCandidate === 'success' || statusCandidate === 'failure' ? statusCandidate : undefined;
  const category = deriveCategory(input.eventType, input.stream, rich);
  const source = deriveSource(input.eventType, rich);
  const actorEmail = toText((rich as Record<string, unknown> | undefined)?.actorEmail);
  const actorDisplayName = toText((rich as Record<string, unknown> | undefined)?.actorDisplayName);
  const requestId = toText((rich as Record<string, unknown> | undefined)?.requestId);
  const promptTokens = toNumber((rich as Record<string, unknown> | undefined)?.promptTokens)
    ?? toUsageNumber((rich as Record<string, unknown> | undefined)?.usage, 'promptTokens');
  const completionTokens = toNumber((rich as Record<string, unknown> | undefined)?.completionTokens)
    ?? toUsageNumber((rich as Record<string, unknown> | undefined)?.usage, 'completionTokens');
  const totalTokens = toNumber((rich as Record<string, unknown> | undefined)?.totalTokens)
    ?? toUsageNumber((rich as Record<string, unknown> | undefined)?.usage, 'totalTokens');
  const costUsd = toNumber((rich as Record<string, unknown> | undefined)?.costUsd)
    ?? toNumber((rich as Record<string, unknown> | undefined)?.estimatedCostUsd);
  const derivedTargetType = input.targetType ?? (requestId ? 'ai_request' : undefined);
  const derivedTargetId = input.targetId ?? requestId;

  const searchable = [
    input.stream,
    input.eventType,
    summary,
    input.actorId,
    actorEmail,
    actorDisplayName,
    derivedTargetType,
    derivedTargetId,
    toText((rich as Record<string, unknown> | undefined)?.provider),
    toText((rich as Record<string, unknown> | undefined)?.model),
    toText((rich as Record<string, unknown> | undefined)?.promptExcerpt),
    toText((rich as Record<string, unknown> | undefined)?.errorSummary),
    toText((rich as Record<string, unknown> | undefined)?.errorMessage),
  ].filter(Boolean).join(' ').toLowerCase();

  return {
    stream: input.stream,
    sourceRecordId: input.sourceRecordId,
    eventType: input.eventType,
    summary,
    occurredAt: input.occurredAt,
    ...(severity ? { severity } : {}),
    ...(status ? { status } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(actorEmail ? { actorEmail } : {}),
    ...(actorDisplayName ? { actorDisplayName } : {}),
    ...(derivedTargetType ? { targetType: derivedTargetType } : {}),
    ...(derivedTargetId ? { targetId: derivedTargetId } : {}),
    category,
    ...(source ? { source } : {}),
    ...(toText((rich as Record<string, unknown> | undefined)?.installationId)
      ? { installationId: toText((rich as Record<string, unknown>).installationId)! }
      : {}),
    ...(toText((rich as Record<string, unknown> | undefined)?.provider)
      ? { provider: toText((rich as Record<string, unknown>).provider)! }
      : {}),
    ...(toText((rich as Record<string, unknown> | undefined)?.model)
      ? { model: toText((rich as Record<string, unknown>).model)! }
      : {}),
    ...(toNumber((rich as Record<string, unknown> | undefined)?.durationMs) !== undefined
      ? { durationMs: toNumber((rich as Record<string, unknown>).durationMs)! }
      : {}),
    ...(costUsd !== undefined
      ? { costUsd }
      : {}),
    ...(promptTokens !== undefined
      ? { promptTokens }
      : {}),
    ...(completionTokens !== undefined
      ? { completionTokens }
      : {}),
    ...(totalTokens !== undefined
      ? { totalTokens }
      : {}),
    ...(toText((rich as Record<string, unknown> | undefined)?.errorSummary) || toText((rich as Record<string, unknown> | undefined)?.errorMessage)
      ? { errorSummary: (toText((rich as Record<string, unknown> | undefined)?.errorSummary) ?? toText((rich as Record<string, unknown> | undefined)?.errorMessage))!.slice(0, 200) }
      : {}),
    ...(searchable ? { searchText: searchable } : {}),
    ...(metadata ? { metadataJson: metadata as Prisma.InputJsonValue } : {}),
    ...(payload ? { payloadJson: payload as Prisma.InputJsonValue } : {}),
  };
}
