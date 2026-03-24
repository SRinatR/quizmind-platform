import { NextResponse } from 'next/server';
import { type AuthForgotPasswordRequest, type AuthForgotPasswordResult } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';

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
  const body = (await request.json().catch(() => null)) as Partial<AuthForgotPasswordRequest> | null;
  const email = body?.email?.trim();

  if (!email) {
    return badRequest('Email is required.');
  }

  const response = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
    }),
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AuthForgotPasswordResult> | {
    message?: string | string[];
  } | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to submit a password reset request right now.';

    return badRequest(
      fallbackMessage ?? 'Unable to submit a password reset request right now.',
      response.status || 500,
    );
  }

  return NextResponse.json({
    ok: true,
    data: payload.data,
  });
}
