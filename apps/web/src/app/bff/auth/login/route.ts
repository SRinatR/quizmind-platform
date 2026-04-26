import { NextResponse } from 'next/server';
import { type AuthExchangePayload, type AuthLoginRequest } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { persistAuthSession } from '../../../../lib/auth-session';
import { buildForwardedAuthHeaders } from '../../../../lib/bff-forwarding';

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
  const body = (await request.json().catch(() => null)) as Partial<AuthLoginRequest> | null;

  if (!body?.email || !body?.password) {
    return badRequest('Email and password are required.');
  }

  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...buildForwardedAuthHeaders(request),
    },
    body: JSON.stringify({
      email: body.email,
      password: body.password,
    }),
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AuthExchangePayload> | {
    message?: string | string[];
  } | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to sign in right now.';

    return badRequest(fallbackMessage ?? 'Unable to sign in right now.', response.status || 500);
  }

  await persistAuthSession(payload.data.session);

  return NextResponse.json({
    ok: true,
    data: {
      expiresAt: payload.data.session.expiresAt,
      user: payload.data.session.user,
    },
  });
}
