import { NextResponse } from 'next/server';
import {
  type CompatibilityHandshake,
  type ExtensionBootstrapPayload,
  type ExtensionBootstrapRequest,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

const validBrowsers = new Set<CompatibilityHandshake['browser']>([
  'chrome',
  'edge',
  'brave',
  'firefox',
  'safari',
  'other',
]);

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

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];
}

function normalizeHandshake(value: unknown): CompatibilityHandshake | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<CompatibilityHandshake>;
  const extensionVersion = candidate.extensionVersion?.trim();
  const schemaVersion = candidate.schemaVersion?.trim();
  const capabilities = normalizeStringArray(candidate.capabilities);

  if (!extensionVersion || !schemaVersion || capabilities.length === 0 || !candidate.browser || !validBrowsers.has(candidate.browser)) {
    return null;
  }

  return {
    extensionVersion,
    schemaVersion,
    capabilities,
    browser: candidate.browser,
  };
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();
  const body = (await request.json().catch(() => null)) as Partial<ExtensionBootstrapRequest> | null;
  const installationId = body?.installationId?.trim();
  const userId = body?.userId?.trim();
  const environment = body?.environment?.trim();
  const workspaceId = body?.workspaceId?.trim() || undefined;
  const planCode = body?.planCode?.trim() || undefined;
  const handshake = normalizeHandshake(body?.handshake);

  if (!installationId || !userId || !environment || !handshake) {
    return badRequest('installationId, userId, environment, and a valid handshake are required.');
  }

  const response = await fetch(`${API_URL}/extension/bootstrap`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      installationId,
      userId,
      environment,
      handshake,
      ...(workspaceId ? { workspaceId } : {}),
      ...(planCode ? { planCode } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<ExtensionBootstrapPayload>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to simulate extension bootstrap right now.';

    return badRequest(fallbackMessage ?? 'Unable to simulate extension bootstrap right now.', response.status || 500);
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
