import { NextResponse } from 'next/server';
import { type WalletBalanceSnapshot } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: { message: string };
}

function badRequest(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>({ ok: false, error: { message } }, { status });
}

export async function GET(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to view your wallet balance.', 401);
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspaceId')?.trim();

  if (!workspaceId) {
    return badRequest('workspaceId is required.');
  }

  const response = await fetch(`${API_URL}/wallet/balance?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<WalletBalanceSnapshot> | null;

  if (!response.ok || !payload?.ok) {
    return badRequest('Unable to fetch wallet balance.', response.status || 500);
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: 200 });
}
