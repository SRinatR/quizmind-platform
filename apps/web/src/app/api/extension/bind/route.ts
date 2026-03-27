import { NextResponse } from 'next/server';
import {
  type CompatibilityHandshake,
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
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
  fallbackCode?: {
    code: string;
    expiresAt: string;
    ttlSeconds: number;
    redeemPath: string;
  };
}

const validBrowsers = new Set<CompatibilityHandshake['browser']>(['chrome', 'edge', 'brave', 'other']);

interface BindRouteDependencies {
  apiUrl: string;
  readAccessToken: () => Promise<string | null>;
  issueFallbackCode: typeof issueBindFallbackCode;
  fetchImpl: typeof fetch;
}

async function readAccessTokenFromCookies() {
  const authSessionModule = await import('../../../../lib/auth-session');

  return authSessionModule.getAccessTokenFromCookies();
}

const defaultBindRouteDependencies: BindRouteDependencies = {
  apiUrl: API_URL,
  readAccessToken: readAccessTokenFromCookies,
  issueFallbackCode: issueBindFallbackCode,
  fetchImpl: fetch,
};

const bindRouteDependencies: BindRouteDependencies = {
  ...defaultBindRouteDependencies,
};

export function setBindRouteDependenciesForTests(overrides: Partial<BindRouteDependencies>) {
  Object.assign(bindRouteDependencies, overrides);
}

export function resetBindRouteDependenciesForTests() {
  Object.assign(bindRouteDependencies, defaultBindRouteDependencies);
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

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];
}

function normalizeBridgeNonce(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  if (!normalized || normalized.length < 8 || normalized.length > 128) {
    return undefined;
  }

  return /^[A-Za-z0-9:_\-.]+$/.test(normalized) ? normalized : undefined;
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
  const accessToken = await bindRouteDependencies.readAccessToken();

  if (!accessToken) {
    return badRequest('Sign in on the site before connecting the extension.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<ExtensionInstallationBindRequest> | null;
  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : '';
  const environment = typeof body?.environment === 'string' ? body.environment.trim() : '';
  const handshake = normalizeHandshake(body?.handshake);
  const requestId = request.headers.get('x-quizmind-bind-request-id')?.trim() || undefined;
  const rawBridgeNonce = request.headers.get('x-quizmind-bridge-nonce')?.trim() || undefined;
  const bridgeNonce = normalizeBridgeNonce(rawBridgeNonce);
  const rawTargetOrigin = request.headers.get('x-quizmind-target-origin')?.trim() || undefined;
  const targetOrigin = normalizeBridgeOrigin(rawTargetOrigin);

  if (!installationId || !environment || !handshake) {
    return badRequest('installationId, environment, and a valid handshake are required.');
  }

  if (rawBridgeNonce && !bridgeNonce) {
    return badRequest('x-quizmind-bridge-nonce must be 8-128 characters using A-Z, a-z, 0-9, "_", "-", ".", or ":".');
  }

  if (rawTargetOrigin && !targetOrigin) {
    return badRequest('x-quizmind-target-origin must be a valid http(s) or extension origin.');
  }

  if ((bridgeNonce && !targetOrigin) || (!bridgeNonce && targetOrigin)) {
    return badRequest('x-quizmind-bridge-nonce and x-quizmind-target-origin must be provided together.');
  }

  if ((bridgeNonce || targetOrigin) && !requestId) {
    return badRequest('x-quizmind-bind-request-id is required when secure bridge headers are provided.');
  }

  const response = await bindRouteDependencies.fetchImpl(`${bindRouteDependencies.apiUrl}/extension/installations/bind`, {
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

  const fallbackCode =
    requestId && bridgeNonce && targetOrigin
      ? await bindRouteDependencies.issueFallbackCode({
          installationId,
          requestId,
          bridgeNonce,
          targetOrigin,
          result: payload.data,
        })
      : undefined;

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
