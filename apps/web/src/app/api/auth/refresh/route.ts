import { NextResponse } from 'next/server';
import { type AuthSessionPayload } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { getRefreshTokenFromCookies, persistAuthSession } from '../../../../lib/auth-session';

export async function POST() {
  const refreshToken = await getRefreshTokenFromCookies();

  if (!refreshToken) {
    return NextResponse.json({ ok: false, error: { message: 'No refresh token.' } }, { status: 401 });
  }

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json(
      { ok: false, error: { message: 'Session could not be refreshed.' } },
      { status: 401 },
    );
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AuthSessionPayload> | null;

  if (!payload?.ok || !payload.data?.accessToken) {
    return NextResponse.json(
      { ok: false, error: { message: 'Session could not be refreshed.' } },
      { status: 401 },
    );
  }

  await persistAuthSession(payload.data);

  return NextResponse.json({
    ok: true,
    data: { expiresAt: payload.data.expiresAt },
  });
}
