import { NextResponse } from 'next/server';
import { type AuthLogoutAllResult } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { clearAuthSession, getAccessTokenFromCookies } from '../../../../lib/auth-session';

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

export async function POST() {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    await clearAuthSession();
    return badRequest('Sign in to end active sessions.', 401);
  }

  const response = await fetch(`${API_URL}/auth/logout-all`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AuthLogoutAllResult> | {
    message?: string | string[];
  } | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to revoke active sessions right now.';

    return badRequest(fallbackMessage ?? 'Unable to revoke active sessions right now.', response.status || 500);
  }

  await clearAuthSession();

  return NextResponse.json({
    ok: true,
    data: payload.data,
  });
}
