import {
  type UsageEventIngestResult,
  type UsageEventPayload,
  type UsageEventSeverity,
} from '@quizmind/contracts';

import { PlatformRequestError } from './platform-bootstrap';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
  };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fallback;
  }

  const candidate = payload as { error?: { message?: string }; message?: string };

  if (typeof candidate.error?.message === 'string' && candidate.error.message.trim().length > 0) {
    return candidate.error.message.trim();
  }

  if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
    return candidate.message.trim();
  }

  return fallback;
}

async function postUsageEvent(input: {
  apiUrl: string;
  token: string;
  event: UsageEventPayload;
  fetcher: typeof fetch;
}): Promise<UsageEventIngestResult> {
  const response = await input.fetcher(`${trimTrailingSlash(input.apiUrl)}/extension/usage-events/v2`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input.event),
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<UsageEventIngestResult> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    const message = resolveErrorMessage(payload, `Unable to send usage event (status ${response.status}).`);
    const retryable = response.status >= 500 || response.status === 429;

    throw new PlatformRequestError(message, response.status, retryable);
  }

  return payload.data;
}

export async function sendUsageEvent(input: {
  apiUrl: string;
  token: string;
  event: UsageEventPayload;
  fetcher?: typeof fetch;
}): Promise<UsageEventIngestResult> {
  return postUsageEvent({
    apiUrl: input.apiUrl,
    token: input.token,
    event: input.event,
    fetcher: input.fetcher ?? fetch,
  });
}

export async function sendRuntimeError(input: {
  apiUrl: string;
  token: string;
  installationId: string;
  workspaceId?: string;
  surface: string;
  message: string;
  stackPreview?: string;
  severity?: UsageEventSeverity;
  feature?: string;
  occurredAt?: string;
  extra?: Record<string, unknown>;
  fetcher?: typeof fetch;
}): Promise<UsageEventIngestResult> {
  return sendUsageEvent({
    apiUrl: input.apiUrl,
    token: input.token,
    fetcher: input.fetcher,
    event: {
      installationId: input.installationId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      eventType: 'extension.runtime_error',
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      payload: {
        surface: input.surface,
        message: input.message,
        ...(input.stackPreview ? { stackPreview: input.stackPreview } : {}),
        ...(input.feature ? { feature: input.feature } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.extra ?? {}),
      },
    },
  });
}

export async function flushBufferedEvents(input: {
  apiUrl: string;
  token: string;
  events: UsageEventPayload[];
  fetcher?: typeof fetch;
}): Promise<{
  delivered: Array<{
    event: UsageEventPayload;
    result: UsageEventIngestResult;
  }>;
  remaining: UsageEventPayload[];
}> {
  const delivered: Array<{
    event: UsageEventPayload;
    result: UsageEventIngestResult;
  }> = [];
  const remaining: UsageEventPayload[] = [];

  for (let index = 0; index < input.events.length; index += 1) {
    const event = input.events[index];

    try {
      const result = await sendUsageEvent({
        apiUrl: input.apiUrl,
        token: input.token,
        event,
        fetcher: input.fetcher,
      });

      delivered.push({
        event,
        result,
      });
    } catch {
      remaining.push(...input.events.slice(index));
      break;
    }
  }

  return {
    delivered,
    remaining,
  };
}
