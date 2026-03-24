import { NextResponse } from 'next/server';
import {
  compatibilityStatuses,
  type CompatibilityRulePublishRequest,
  type CompatibilityRulePublishResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

const validStatuses = new Set(compatibilityStatuses);

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
    ? Array.from(
        new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)),
      )
    : [];
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to publish a compatibility rule.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<CompatibilityRulePublishRequest> | null;
  const minimumVersion = typeof body?.minimumVersion === 'string' ? body.minimumVersion.trim() : '';
  const recommendedVersion = typeof body?.recommendedVersion === 'string' ? body.recommendedVersion.trim() : '';
  const supportedSchemaVersions = normalizeStringArray(body?.supportedSchemaVersions);
  const requiredCapabilities = normalizeStringArray(body?.requiredCapabilities);
  const resultStatus = body?.resultStatus && validStatuses.has(body.resultStatus) ? body.resultStatus : undefined;
  const reason =
    body && 'reason' in body
      ? typeof body.reason === 'string'
        ? body.reason.trim() || null
        : body.reason === null
          ? null
          : undefined
      : undefined;

  if (!minimumVersion) {
    return badRequest('minimumVersion is required.');
  }

  if (!recommendedVersion) {
    return badRequest('recommendedVersion is required.');
  }

  if (supportedSchemaVersions.length === 0) {
    return badRequest('At least one supported schema version is required.');
  }

  if (!resultStatus) {
    return badRequest('resultStatus must be a valid compatibility status.');
  }

  const response = await fetch(`${API_URL}/admin/compatibility/publish`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      minimumVersion,
      recommendedVersion,
      supportedSchemaVersions,
      resultStatus,
      ...(body && 'requiredCapabilities' in body ? { requiredCapabilities } : {}),
      ...(reason !== undefined ? { reason } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<CompatibilityRulePublishResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to publish compatibility rule right now.';

    return badRequest(fallbackMessage ?? 'Unable to publish compatibility rule right now.', response.status || 500);
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
