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

export function setAdminLogDetailRouteDependenciesForTests(overrides: Partial<typeof defaultDeps>) {
  deps = { ...deps, ...overrides };
}

export function resetAdminLogDetailRouteDependenciesForTests() {
  deps = { ...defaultDeps };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const accessToken = await deps.readAccessToken();
  if (!accessToken) return badRequest('Sign in to access admin logs.', 401);

  const { id } = await context.params;
  if (!id?.trim()) return badRequest('Log id is required.');

  const response = await deps.fetchImpl(`${deps.apiUrl}/admin/logs/${encodeURIComponent(id)}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<unknown>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message) ? payload.message[0] : payload.message
        : 'Unable to load admin log entry right now.';
    return badRequest(fallbackMessage ?? 'Unable to load admin log entry right now.', response.status || 500);
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: response.status });
}
