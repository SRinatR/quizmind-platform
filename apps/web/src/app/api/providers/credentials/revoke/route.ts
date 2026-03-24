import { NextResponse } from 'next/server';
import {
  type ProviderCredentialRevokeRequest,
  type ProviderCredentialRevokeResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

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
    return badRequest('Sign in to revoke provider credentials.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<ProviderCredentialRevokeRequest> | null;
  const credentialId = body?.credentialId?.trim();

  if (!credentialId) {
    return badRequest('credentialId is required.');
  }

  const response = await fetch(`${API_URL}/providers/credentials/revoke`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      credentialId,
      ...(body?.reason?.trim() ? { reason: body.reason.trim() } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<ProviderCredentialRevokeResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to revoke provider credential right now.';

    return badRequest(fallbackMessage ?? 'Unable to revoke provider credential right now.', response.status || 500);
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
