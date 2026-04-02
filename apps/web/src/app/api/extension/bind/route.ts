import { NextResponse } from 'next/server';
import {
  type CompatibilityHandshake,
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
} from '@quizmind/contracts';

import { API_URL, getSession, type ApiEnvelope } from '../../../../lib/api';
import {
  BindCodeStoreUnavailableError,
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

const validBrowsers = new Set<CompatibilityHandshake['browser']>([
  'chrome',
  'edge',
  'brave',
  'firefox',
  'safari',
  'other',
]);
const validBridgeModes = new Set(['bind_result', 'fallback_code']);
const maxEnvironmentLength = 64;
const environmentTokenPattern = /^[A-Za-z0-9._-]+$/;
type BridgeMode = 'bind_result' | 'fallback_code';

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

function normalizeBridgeRequestId(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  if (!normalized || normalized.length < 8 || normalized.length > 160) {
    return undefined;
  }

  return /^[A-Za-z0-9:_\-.]+$/.test(normalized) ? normalized : undefined;
}

function normalizeBridgeMode(value: string | undefined): BridgeMode | undefined {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  return validBridgeModes.has(normalized) ? (normalized as BridgeMode) : undefined;
}

function normalizeEnvironment(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maxEnvironmentLength) {
    return null;
  }

  return environmentTokenPattern.test(normalized) ? normalized : null;
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
  // workspaceId resolved internally from session — compatibility layer, not exposed in UI
  const session = await getSession('connected-user', accessToken);
  const workspaceId = session?.workspaces[0]?.id ?? '';
  const rawEnvironment = typeof body?.environment === 'string' ? body.environment : undefined;
  const environment = normalizeEnvironment(body?.environment);
  const handshake = normalizeHandshake(body?.handshake);
  const rawRequestId = request.headers.get('x-quizmind-bind-request-id')?.trim() || undefined;
  const requestId = normalizeBridgeRequestId(rawRequestId);
  const rawBridgeNonce = request.headers.get('x-quizmind-bridge-nonce')?.trim() || undefined;
  const bridgeNonce = normalizeBridgeNonce(rawBridgeNonce);
  const rawTargetOrigin = request.headers.get('x-quizmind-target-origin')?.trim() || undefined;
  const targetOrigin = normalizeBridgeOrigin(rawTargetOrigin);
  const rawBridgeMode = request.headers.get('x-quizmind-bridge-mode')?.trim() || undefined;
  const bridgeMode = normalizeBridgeMode(rawBridgeMode) ?? 'bind_result';

  if (rawEnvironment && !environment) {
    return badRequest(
      `environment must be 1-${String(maxEnvironmentLength)} characters using A-Z, a-z, 0-9, ".", "_", or "-".`,
    );
  }

  if (!installationId || !environment || !handshake) {
    return badRequest('installationId, environment, and a valid handshake are required.');
  }

  if (rawBridgeNonce && !bridgeNonce) {
    return badRequest('x-quizmind-bridge-nonce must be 8-128 characters using A-Z, a-z, 0-9, "_", "-", ".", or ":".');
  }

  if (rawRequestId && !requestId) {
    return badRequest('x-quizmind-bind-request-id must be 8-160 characters using A-Z, a-z, 0-9, "_", "-", ".", or ":".');
  }

  if (rawTargetOrigin && !targetOrigin) {
    return badRequest('x-quizmind-target-origin must be a valid http(s) or extension origin.');
  }

  if (rawBridgeMode && !normalizeBridgeMode(rawBridgeMode)) {
    return badRequest('x-quizmind-bridge-mode must be one of: bind_result, fallback_code.');
  }

  if ((bridgeNonce && !targetOrigin) || (!bridgeNonce && targetOrigin)) {
    return badRequest('x-quizmind-bridge-nonce and x-quizmind-target-origin must be provided together.');
  }

  if ((bridgeNonce || targetOrigin) && !requestId) {
    return badRequest('x-quizmind-bind-request-id is required when secure bridge headers are provided.');
  }

  if (bridgeMode === 'fallback_code' && (!requestId || !bridgeNonce || !targetOrigin)) {
    return badRequest(
      'x-quizmind-bridge-mode=fallback_code requires x-quizmind-bind-request-id, x-quizmind-bridge-nonce, and x-quizmind-target-origin.',
    );
  }

  let response: Response;

  try {
    response = await bindRouteDependencies.fetchImpl(`${bindRouteDependencies.apiUrl}/extension/installations/bind`, {
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
  } catch (error) {
    console.warn(
      JSON.stringify({
        eventType: 'extension.bind_proxy_request_failed',
        occurredAt: new Date().toISOString(),
        installationId,
        workspaceId: workspaceId || null,
        environment,
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
    return badRequest('Platform bind service is unavailable right now.', 503);
  }

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

    console.warn(
      JSON.stringify({
        eventType: 'extension.bind_proxy_upstream_failed',
        occurredAt: new Date().toISOString(),
        installationId,
        workspaceId: workspaceId || null,
        environment,
        status: response.status,
        errorMessage: fallbackMessage ?? 'Unable to bind the extension installation right now.',
      }),
    );

    return badRequest(fallbackMessage ?? 'Unable to bind the extension installation right now.', response.status || 500);
  }

  let fallbackCode: RouteSuccessPayload['fallbackCode'];

  if (bridgeMode === 'fallback_code' && requestId && bridgeNonce && targetOrigin) {
    try {
      fallbackCode = await bindRouteDependencies.issueFallbackCode({
        installationId,
        requestId,
        bridgeNonce,
        targetOrigin,
        result: payload.data,
      });
    } catch (error) {
      if (!(error instanceof BindCodeStoreUnavailableError)) {
        return badRequest('Unable to issue secure fallback bind code right now.', 503);
      }
    }
  }

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
