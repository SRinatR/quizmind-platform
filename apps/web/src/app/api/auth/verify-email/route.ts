import { NextResponse } from 'next/server';
import { type AuthVerifyEmailResult } from '@quizmind/contracts';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token')?.trim();

  if (!token) {
    return badRequest('Email verification token is required.');
  }

  const response = await fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
    },
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AuthVerifyEmailResult> | {
    message?: string | string[];
  } | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to verify the email right now.';

    return badRequest(fallbackMessage ?? 'Unable to verify the email right now.', response.status || 500);
  }

  return NextResponse.json({
    ok: true,
    data: payload.data,
  });
}
