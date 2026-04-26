import { NextResponse } from 'next/server';
import { type AuthResetPasswordRequest, type AuthResetPasswordResult } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { buildForwardedAuthHeaders } from '../../../../lib/bff-forwarding';
import { persistAuthSession } from '../../../../lib/auth-session';

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
  const body = (await request.json().catch(() => null)) as Partial<AuthResetPasswordRequest> | null;
  const token = body?.token?.trim();
  const password = body?.password;

  if (!token || !password) {
    return badRequest('Token and password are required.');
  }

  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...buildForwardedAuthHeaders(request),
    },
    body: JSON.stringify({
      token,
      password,
    }),
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AuthResetPasswordResult> | {
    message?: string | string[];
  } | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to reset the password right now.';

    return badRequest(fallbackMessage ?? 'Unable to reset the password right now.', response.status || 500);
  }

  await persistAuthSession(payload.data.session);

  return NextResponse.json({
    ok: true,
    data: {
      expiresAt: payload.data.session.expiresAt,
      user: payload.data.session.user,
      resetAt: payload.data.resetAt,
    },
  });
}
