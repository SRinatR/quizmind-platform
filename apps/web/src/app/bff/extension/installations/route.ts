import { NextResponse } from 'next/server';
import { type ExtensionInstallationInventorySnapshot } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: { message: string };
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>({ ok: false, error: { message } }, { status });
}

export async function GET() {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return errorResponse('Sign in to view installations.', 401);
  }

  const response = await fetch(`${API_URL}/extension/installations`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<ExtensionInstallationInventorySnapshot> | null;

  if (!response.ok || !payload?.ok) {
    return errorResponse('Unable to fetch installation inventory.', response.status || 500);
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: 200 });
}
