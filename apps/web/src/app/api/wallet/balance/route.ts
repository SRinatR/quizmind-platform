import { NextResponse } from 'next/server';
import { type WalletBalanceSnapshot } from '@quizmind/contracts';

import { API_URL, getSession, type ApiEnvelope } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: { message: string };
}

function badRequest(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>({ ok: false, error: { message } }, { status });
}

export async function GET() {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to view your wallet balance.', 401);
  }

  // Resolve workspaceId from session — compatibility layer, hidden from client
  const session = await getSession('connected-user', accessToken);
  const workspaceId = session?.workspaces[0]?.id;

  if (!workspaceId) {
    return badRequest('No account wallet found.', 404);
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
