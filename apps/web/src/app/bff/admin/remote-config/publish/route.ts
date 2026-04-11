import { NextResponse } from 'next/server';
import {
  type RemoteConfigLayer,
  type RemoteConfigPublishRequest,
  type RemoteConfigPublishResponse,
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

function isRemoteConfigLayer(value: unknown): value is RemoteConfigLayer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<RemoteConfigLayer>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.scope === 'string' &&
    typeof candidate.priority === 'number' &&
    candidate.values !== undefined &&
    typeof candidate.values === 'object' &&
    candidate.values !== null &&
    !Array.isArray(candidate.values)
  );
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to publish remote config.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<RemoteConfigPublishRequest> | null;
  const versionLabel = body?.versionLabel?.trim();
  const layers = Array.isArray(body?.layers) ? body.layers.filter(isRemoteConfigLayer) : [];

  if (!versionLabel) {
    return badRequest('versionLabel is required.');
  }

  if (layers.length === 0) {
    return badRequest('At least one valid remote config layer is required.');
  }

  const response = await fetch(`${API_URL}/admin/remote-config/publish`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      versionLabel,
      layers,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<RemoteConfigPublishResponse>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to publish remote config right now.';

    return badRequest(fallbackMessage ?? 'Unable to publish remote config right now.', response.status || 500);
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
