import { NextResponse } from 'next/server';
import { type AdminWebhookRetryRequest, type AdminWebhookRetryResult } from '@quizmind/contracts';

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

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to retry webhook deliveries.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<AdminWebhookRetryRequest> | null;
  const webhookEventId = typeof body?.webhookEventId === 'string' ? body.webhookEventId.trim() : '';

  if (!webhookEventId) {
    return badRequest('webhookEventId is required.');
  }

  const response = await fetch(`${API_URL}/admin/webhooks/retry`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      webhookEventId,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<AdminWebhookRetryResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to retry webhook delivery right now.';

    return badRequest(fallbackMessage ?? 'Unable to retry webhook delivery right now.', response.status || 500);
  }

  return NextResponse.json(
    {
      ok: true,
      data: payload.data,
    },
    {
      status: response.status,
    },
  );
}
