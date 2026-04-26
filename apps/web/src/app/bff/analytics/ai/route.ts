import { NextResponse } from 'next/server';
import { type AiAnalyticsSnapshot } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: { message: string };
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>({ ok: false, error: { message } }, { status });
}

export async function GET(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return errorResponse('Sign in to view analytics.', 401);
  }

  const { searchParams } = new URL(request.url);
  const upstreamParams = new URLSearchParams();
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (from) {
    upstreamParams.set('from', from);
  }
  if (to) {
    upstreamParams.set('to', to);
  }

  const response = await fetch(`${API_URL}/analytics/ai?${upstreamParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AiAnalyticsSnapshot> | null;

  if (!response.ok || !payload?.ok) {
    return errorResponse('Unable to fetch analytics.', response.status || 500);
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: 200 });
}
