import { NextResponse } from 'next/server';
import {
  type UsageEventIngestResult,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

function badRequest(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>(
    {
      ok: false,
      error: {
        message,
      },
    },
    { status },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();
  const body = (await request.json().catch(() => null)) as Partial<UsageEventPayload> | null;
  const installationId = body?.installationId?.trim();
  const eventType = body?.eventType?.trim();
  const occurredAt = body?.occurredAt?.trim();
  const payload = body?.payload;

  if (!installationId || !eventType || !occurredAt || !isRecord(payload)) {
    return badRequest('installationId, eventType, occurredAt, and a JSON payload object are required.');
  }

  if (Number.isNaN(new Date(occurredAt).getTime())) {
    return badRequest('occurredAt must be a valid ISO datetime string.');
  }

  const response = await fetch(`${API_URL}/extension/usage-events`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      installationId,
      eventType,
      occurredAt,
      payload,
    } satisfies UsageEventPayload),
  });

  const responsePayload = (await response.json().catch(() => null)) as
    | ApiEnvelope<UsageEventIngestResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !responsePayload || !('ok' in responsePayload) || !responsePayload.ok) {
    const fallbackMessage =
      responsePayload && 'message' in responsePayload
        ? Array.isArray(responsePayload.message)
          ? responsePayload.message[0]
          : responsePayload.message
        : 'Unable to queue usage event right now.';

    return badRequest(fallbackMessage ?? 'Unable to queue usage event right now.', response.status || 500);
  }

  return NextResponse.json(
    {
      ok: true,
      data: responsePayload.data,
    },
    {
      status: response.status,
    },
  );
}
