import { NextResponse } from 'next/server';
import { type UserProfilePayload, type UserProfileUpdateRequest } from '@quizmind/contracts';

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

function resolveFallbackMessage(
  payload: ApiEnvelope<UserProfilePayload> | { message?: string | string[] } | null,
  fallback: string,
): string {
  if (!payload || !('message' in payload)) {
    return fallback;
  }

  if (Array.isArray(payload.message)) {
    return payload.message[0] ?? fallback;
  }

  return payload.message ?? fallback;
}

export async function GET() {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to load profile settings.', 401);
  }

  const response = await fetch(`${API_URL}/user/profile`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<UserProfilePayload>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    return badRequest(
      resolveFallbackMessage(payload, 'Unable to load profile settings right now.'),
      response.status || 500,
    );
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

export async function PATCH(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to update profile settings.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<UserProfileUpdateRequest> | null;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('Request body is required.');
  }

  const hasMutableField = ['displayName', 'avatarUrl', 'locale', 'timezone'].some((field) => field in body);

  if (!hasMutableField) {
    return badRequest('At least one profile field must be provided: displayName, avatarUrl, locale, timezone.');
  }

  const response = await fetch(`${API_URL}/user/profile`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...('displayName' in body ? { displayName: body.displayName } : {}),
      ...('avatarUrl' in body ? { avatarUrl: body.avatarUrl } : {}),
      ...('locale' in body ? { locale: body.locale } : {}),
      ...('timezone' in body ? { timezone: body.timezone } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<UserProfilePayload>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    return badRequest(
      resolveFallbackMessage(payload, 'Unable to update profile settings right now.'),
      response.status || 500,
    );
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
