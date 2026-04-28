import { NextRequest, NextResponse } from 'next/server';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: { message: string };
}

function badRequest(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>({ ok: false, error: { message } }, { status });
}

const defaultDeps = {
  apiUrl: API_URL,
  readAccessToken: getAccessTokenFromCookies,
  fetchImpl: fetch,
};

let deps = { ...defaultDeps };

export function setAdminRetentionRouteDependenciesForTests(overrides: Partial<typeof defaultDeps>) {
  deps = { ...deps, ...overrides };
}

export function resetAdminRetentionRouteDependenciesForTests() {
  deps = { ...defaultDeps };
}

export async function GET() {
  const accessToken = await deps.readAccessToken();
  if (!accessToken) return badRequest('Sign in to access retention settings.', 401);

  const response = await deps.fetchImpl(`${deps.apiUrl}/admin/settings/retention`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | { message?: string | string[] } | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage = payload && 'message' in payload
      ? Array.isArray(payload.message) ? payload.message[0] : payload.message
      : 'Unable to load retention settings right now.';
    return badRequest(fallbackMessage ?? 'Unable to load retention settings right now.', response.status || 500);
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: response.status });
}

export async function PATCH(request: NextRequest) {
  const accessToken = await deps.readAccessToken();
  if (!accessToken) return badRequest('Sign in to update retention settings.', 401);

  const body = await request.json().catch(() => ({}));
  const response = await deps.fetchImpl(`${deps.apiUrl}/admin/settings/retention`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | { message?: string | string[] } | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage = payload && 'message' in payload
      ? Array.isArray(payload.message) ? payload.message[0] : payload.message
      : 'Unable to update retention settings right now.';
    return badRequest(fallbackMessage ?? 'Unable to update retention settings right now.', response.status || 500);
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: response.status });
}
