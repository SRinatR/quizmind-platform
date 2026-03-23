import { NextResponse } from 'next/server';
import { type SupportImpersonationEndRequest, type SupportImpersonationEndResult } from '@quizmind/contracts';

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
    return badRequest('Sign in to end a support session.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<SupportImpersonationEndRequest> | null;
  const impersonationSessionId = body?.impersonationSessionId?.trim();

  if (!impersonationSessionId) {
    return badRequest('Impersonation session is required.');
  }

  const response = await fetch(`${API_URL}/support/impersonation/end`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      impersonationSessionId,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<SupportImpersonationEndResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to end the support session right now.';

    return badRequest(fallbackMessage ?? 'Unable to end the support session right now.', response.status || 500);
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
