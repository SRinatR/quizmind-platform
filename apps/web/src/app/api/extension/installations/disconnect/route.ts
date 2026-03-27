import { NextResponse } from 'next/server';
import {
  type ExtensionInstallationDisconnectRequest,
  type ExtensionInstallationDisconnectResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

interface DisconnectRouteDependencies {
  apiUrl: string;
  readAccessToken: () => Promise<string | null>;
  fetchImpl: typeof fetch;
}

async function readAccessTokenFromCookies() {
  const authSessionModule = await import('../../../../../lib/auth-session');

  return authSessionModule.getAccessTokenFromCookies();
}

const defaultDisconnectRouteDependencies: DisconnectRouteDependencies = {
  apiUrl: API_URL,
  readAccessToken: readAccessTokenFromCookies,
  fetchImpl: fetch,
};

const disconnectRouteDependencies: DisconnectRouteDependencies = {
  ...defaultDisconnectRouteDependencies,
};

export function setDisconnectRouteDependenciesForTests(overrides: Partial<DisconnectRouteDependencies>) {
  Object.assign(disconnectRouteDependencies, overrides);
}

export function resetDisconnectRouteDependenciesForTests() {
  Object.assign(disconnectRouteDependencies, defaultDisconnectRouteDependencies);
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
  const accessToken = await disconnectRouteDependencies.readAccessToken();

  if (!accessToken) {
    return badRequest('Sign in on the site before disconnecting an extension installation.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<ExtensionInstallationDisconnectRequest> | null;
  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

  if (!installationId) {
    return badRequest('installationId is required.');
  }

  if (!reason) {
    return badRequest('reason is required.');
  }

  const response = await disconnectRouteDependencies.fetchImpl(`${disconnectRouteDependencies.apiUrl}/extension/installations/disconnect`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      installationId,
      ...(workspaceId ? { workspaceId } : {}),
      reason,
    } satisfies ExtensionInstallationDisconnectRequest),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<ExtensionInstallationDisconnectResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to disconnect the extension installation right now.';

    return badRequest(fallbackMessage ?? 'Unable to disconnect the extension installation right now.', response.status || 500);
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
