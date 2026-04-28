import { NextRequest, NextResponse } from 'next/server';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { message } }, { status });
}

export async function GET() {
  const accessToken = await getAccessTokenFromCookies();
  if (!accessToken) return badRequest('Sign in to access AI pricing settings.', 401);

  const response = await fetch(`${API_URL}/admin/settings/ai-pricing`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!response.ok || !payload?.ok) return badRequest('Unable to load AI pricing settings right now.', response.status || 500);
  return NextResponse.json({ ok: true, data: payload.data }, { status: response.status });
}

export async function PATCH(request: NextRequest) {
  const accessToken = await getAccessTokenFromCookies();
  if (!accessToken) return badRequest('Sign in to update AI pricing settings.', 401);

  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${API_URL}/admin/settings/ai-pricing`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!response.ok || !payload?.ok) return badRequest('Unable to update AI pricing settings right now.', response.status || 500);
  return NextResponse.json({ ok: true, data: payload.data }, { status: response.status });
}
