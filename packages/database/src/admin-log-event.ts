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
  if (et.startsWith('webhook.') || et.includes('webhook_')) return 'webhook';
  return undefined;
}

export function buildAdminLogEventCreateInput(input: BuildAdminLogEventInput): Prisma.AdminLogEventCreateInput {
  const metadata = input.metadata;
  const payload = input.payload;
  const rich = metadata ?? payload;
  const summary = toText((rich as Record<string, unknown> | undefined)?.summary) ??
    (input.stream === 'audit' && input.targetType && input.targetId
      ? `Audit event ${input.eventType} on ${input.targetType} ${input.targetId}.`
      : input.eventType);
  const statusCandidate = toText((rich as Record<string, unknown> | undefined)?.status);
  const severityCandidate = toText((rich as Record<string, unknown> | undefined)?.severity);
  const severity = input.severity ?? (severityCandidate === 'debug' || severityCandidate === 'info' || severityCandidate === 'warn' || severityCandidate === 'error'
    ? (severityCandidate as EventSeverity)
    : undefined);
  const status = statusCandidate === 'success' || statusCandidate === 'failure' ? statusCandidate : undefined;
  const category = deriveCategory(input.eventType, input.stream, rich);
  const source = deriveSource(input.eventType, rich);

  const searchable = [
    input.stream,
    input.eventType,
    summary,
    input.actorId,
    input.targetType,
    input.targetId,
    toText((rich as Record<string, unknown> | undefined)?.provider),
    toText((rich as Record<string, unknown> | undefined)?.model),
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
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
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
    ...(toNumber((rich as Record<string, unknown> | undefined)?.costUsd) !== undefined
      ? { costUsd: toNumber((rich as Record<string, unknown>).costUsd)! }
      : {}),
    ...(toNumber((rich as Record<string, unknown> | undefined)?.promptTokens) !== undefined
      ? { promptTokens: toNumber((rich as Record<string, unknown>).promptTokens)! }
      : {}),
    ...(toNumber((rich as Record<string, unknown> | undefined)?.completionTokens) !== undefined
      ? { completionTokens: toNumber((rich as Record<string, unknown>).completionTokens)! }
      : {}),
    ...(toNumber((rich as Record<string, unknown> | undefined)?.totalTokens) !== undefined
      ? { totalTokens: toNumber((rich as Record<string, unknown>).totalTokens)! }
      : {}),
    ...(toText((rich as Record<string, unknown> | undefined)?.errorSummary) || toText((rich as Record<string, unknown> | undefined)?.errorMessage)
      ? { errorSummary: (toText((rich as Record<string, unknown> | undefined)?.errorSummary) ?? toText((rich as Record<string, unknown> | undefined)?.errorMessage))!.slice(0, 200) }
      : {}),
    ...(searchable ? { searchText: searchable } : {}),
    ...(metadata ? { metadataJson: metadata as Prisma.InputJsonValue } : {}),
    ...(payload ? { payloadJson: payload as Prisma.InputJsonValue } : {}),
  };
}
