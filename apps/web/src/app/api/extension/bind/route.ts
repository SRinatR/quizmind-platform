import { NextResponse } from 'next/server';
import {
  type CompatibilityHandshake,
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
    details?: Record<string, unknown>;
  };
}

const validBrowsers = new Set<CompatibilityHandshake['browser']>(['chrome', 'edge', 'brave', 'other']);

function badRequest(message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json<RouteErrorPayload>(
    {
      ok: false,
      error: {
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)))
    : [];
}

function normalizeHandshake(value: unknown): { handshake: CompatibilityHandshake | null; missingFields: string[]; invalidBrowser?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      handshake: null,
      missingFields: ['extensionVersion', 'schemaVersion', 'capabilities', 'browser'],
    };
  }

  const candidate = value as Partial<CompatibilityHandshake>;
  const extensionVersion = candidate.extensionVersion?.trim();
  const schemaVersion = candidate.schemaVersion?.trim();
  const capabilities = normalizeStringArray(candidate.capabilities);
  const browser = typeof candidate.browser === 'string' ? candidate.browser.trim().toLowerCase() : '';
  const normalizedBrowser = browser && validBrowsers.has(browser as CompatibilityHandshake['browser'])
    ? (browser as CompatibilityHandshake['browser'])
    : undefined;

  const missingFields = [
    ...(!extensionVersion ? ['extensionVersion'] : []),
    ...(!schemaVersion ? ['schemaVersion'] : []),
    ...(capabilities.length === 0 ? ['capabilities'] : []),
    ...(!normalizedBrowser ? ['browser'] : []),
  ];

  if (missingFields.length > 0 || !normalizedBrowser) {
    return {
      handshake: null,
      missingFields,
      ...(browser && !normalizedBrowser ? { invalidBrowser: browser } : {}),
    };
  }

  return {
    handshake: {
      extensionVersion: extensionVersion!,
      schemaVersion: schemaVersion!,
      capabilities,
      browser: normalizedBrowser,
      ...(candidate.buildId?.trim() ? { buildId: candidate.buildId.trim() } : {}),
    },
    missingFields: [],
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
  const handshakeValidation = normalizeHandshake(body?.handshake);

  if (!installationId || !environment || !handshakeValidation.handshake) {
    return badRequest('installationId, environment, and a valid handshake are required.', 400, {
      missingTopLevelFields: [
        ...(!installationId ? ['installationId'] : []),
        ...(!environment ? ['environment'] : []),
      ],
      missingHandshakeFields: handshakeValidation.missingFields,
      validBrowsers: Array.from(validBrowsers),
      ...(handshakeValidation.invalidBrowser ? { invalidBrowser: handshakeValidation.invalidBrowser } : {}),
    });
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
      handshake: handshakeValidation.handshake,
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
