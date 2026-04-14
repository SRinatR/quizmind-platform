import { NextResponse } from 'next/server';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: { message: string };
}

function badRequest(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>({ ok: false, error: { message } }, { status });
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to delete users.', 401);
  }

  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';

  if (!userId) {
    return badRequest('userId is required.');
  }

  const response = await fetch(`${API_URL}/admin/users/delete`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<{ userId: string }>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to delete the user right now.';

    return badRequest(fallbackMessage ?? 'Unable to delete the user right now.', response.status || 500);
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: response.status });
}
