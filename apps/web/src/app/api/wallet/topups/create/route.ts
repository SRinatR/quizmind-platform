import { NextResponse } from 'next/server';
import { type WalletTopUpCreateRequest, type WalletTopUpCreateResult } from '@quizmind/contracts';

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
    return badRequest('Sign in to top up your balance.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<WalletTopUpCreateRequest> | null;
  const workspaceId = body?.workspaceId?.trim();
  const amountKopecks = body?.amountKopecks;

  if (!workspaceId) {
    return badRequest('workspaceId is required.');
  }

  if (!Number.isInteger(amountKopecks) || amountKopecks === undefined || amountKopecks <= 0) {
    return badRequest('amountKopecks must be a positive integer.');
  }

  const response = await fetch(`${API_URL}/wallet/topups/create`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ workspaceId, amountKopecks }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<WalletTopUpCreateResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to create top-up right now.';

    return badRequest(fallbackMessage ?? 'Unable to create top-up right now.', response.status || 500);
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: 200 });
}
