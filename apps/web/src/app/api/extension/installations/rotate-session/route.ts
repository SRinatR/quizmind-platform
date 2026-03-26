import { NextResponse } from 'next/server';
import {
  type ExtensionInstallationRotateSessionRequest,
  type ExtensionInstallationRotateSessionResult,
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
    return badRequest('Sign in on the site before rotating an installation session.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<ExtensionInstallationRotateSessionRequest> | null;
  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : '';

  if (!installationId) {
    return badRequest('installationId is required.');
  }

  const response = await fetch(`${API_URL}/extension/installations/rotate-session`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      installationId,
      ...(workspaceId ? { workspaceId } : {}),
    } satisfies ExtensionInstallationRotateSessionRequest),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<ExtensionInstallationRotateSessionResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to rotate the installation session right now.';

    return badRequest(fallbackMessage ?? 'Unable to rotate the installation session right now.', response.status || 500);
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
