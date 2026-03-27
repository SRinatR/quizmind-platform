import { NextResponse } from 'next/server';
import {
  type CompatibilityHandshake,
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';
import {
  issueBindFallbackCode,
  normalizeBridgeOrigin,
} from '../../../../lib/extension-bind-code-store';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

interface RouteSuccessPayload {
  ok: true;
  data: ExtensionInstallationBindResult;
  fallbackCode: {
    code: string;
    expiresAt: string;
    ttlSeconds: number;
    redeemPath: string;
  };
}

const validBrowsers = new Set<CompatibilityHandshake['browser']>(['chrome', 'edge', 'brave', 'other']);

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
    ...(candidate.buildId?.trim() ? { buildId: candidate.buildId.trim() } : {}),
  };
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in on the site before connecting the extension.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<ExtensionInstallationBindRequest> | null;
  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : '';
  const environment = typeof body?.environment === 'string' ? body.environment.trim() : '';
  const handshake = normalizeHandshake(body?.handshake);
  const requestId = request.headers.get('x-quizmind-bind-request-id')?.trim() || undefined;
  const bridgeNonce = request.headers.get('x-quizmind-bridge-nonce')?.trim() || undefined;
  const targetOrigin = normalizeBridgeOrigin(
    request.headers.get('x-quizmind-target-origin')?.trim() || undefined,
  );

  if (!installationId || !environment || !handshake) {
    return badRequest('installationId, environment, and a valid handshake are required.');
  }

  const response = await fetch(`${API_URL}/extension/installations/bind`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      installationId,
      environment,
      handshake,
      ...(workspaceId ? { workspaceId } : {}),
    } satisfies ExtensionInstallationBindRequest),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<ExtensionInstallationBindResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to bind the extension installation right now.';

    return badRequest(fallbackMessage ?? 'Unable to bind the extension installation right now.', response.status || 500);
  }

  const fallbackCode = await issueBindFallbackCode({
    installationId,
    requestId,
    bridgeNonce,
    targetOrigin,
    result: payload.data,
  });

  return NextResponse.json<RouteSuccessPayload>(
    {
      ok: true,
      data: payload.data,
      fallbackCode,
    },
    {
      status: response.status,
    },
  );
}
