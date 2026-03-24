import { NextResponse } from 'next/server';
import {
  type BillingPortalRequest,
  type BillingPortalResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

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

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to open the billing portal.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<BillingPortalRequest> | null;
  const workspaceId = body?.workspaceId?.trim();

  if (!workspaceId) {
    return badRequest('workspaceId is required.');
  }

  const params = new URLSearchParams({
    workspaceId,
  });

  if (body?.returnPath?.trim()) {
    params.set('returnPath', body.returnPath.trim());
  }

  const response = await fetch(`${API_URL}/billing/portal?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<BillingPortalResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to open the billing portal right now.';

    return badRequest(fallbackMessage ?? 'Unable to open the billing portal right now.', response.status || 500);
  }

  return NextResponse.json(
    {
      ok: true,
      data: payload.data,
    },
    {
      status: response.status,
    },
  );
}
