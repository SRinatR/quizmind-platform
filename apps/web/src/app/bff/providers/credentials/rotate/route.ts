import { NextResponse } from 'next/server';
import {
  type ProviderCredentialMutationResult,
  type ProviderCredentialRotateRequest,
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
    return badRequest('Sign in to rotate provider credentials.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<ProviderCredentialRotateRequest> | null;
  const credentialId = body?.credentialId?.trim();
  const secret = body?.secret?.trim();

  if (!credentialId || !secret) {
    return badRequest('credentialId and secret are required.');
  }

  const response = await fetch(`${API_URL}/providers/credentials/rotate`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      credentialId,
      secret,
      ...(body?.scopes ? { scopes: body.scopes } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<ProviderCredentialMutationResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to rotate provider credential right now.';

    return badRequest(fallbackMessage ?? 'Unable to rotate provider credential right now.', response.status || 500);
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
