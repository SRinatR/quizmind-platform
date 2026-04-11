import { NextResponse } from 'next/server';
import {
  featureFlagStatuses,
  type FeatureFlagDefinition,
  type FeatureFlagUpdateRequest,
  type FeatureFlagUpdateResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

const validStatuses = new Set<FeatureFlagDefinition['status']>(featureFlagStatuses);

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

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to update feature flags.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<FeatureFlagUpdateRequest> | null;
  const key = body?.key?.trim();
  const description = typeof body?.description === 'string' ? body.description.trim() : undefined;
  const status = body?.status && validStatuses.has(body.status) ? body.status : undefined;
  const enabled = typeof body?.enabled === 'boolean' ? body.enabled : undefined;
  const minimumExtensionVersion =
    body && 'minimumExtensionVersion' in body
      ? typeof body.minimumExtensionVersion === 'string'
        ? body.minimumExtensionVersion.trim() || null
        : body.minimumExtensionVersion === null
          ? null
          : undefined
      : undefined;
  const rolloutPercentage =
    body && 'rolloutPercentage' in body
      ? body.rolloutPercentage === null
        ? null
        : typeof body.rolloutPercentage === 'number' && Number.isFinite(body.rolloutPercentage)
          ? body.rolloutPercentage
          : undefined
      : undefined;
  const allowRoles = normalizeStringArray(body?.allowRoles);
  const allowUsers = normalizeStringArray(body?.allowUsers);

  if (!key) {
    return badRequest('key is required.');
  }

  const response = await fetch(`${API_URL}/admin/feature-flags/update`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      key,
      ...(description !== undefined ? { description } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(rolloutPercentage !== undefined ? { rolloutPercentage } : {}),
      ...(minimumExtensionVersion !== undefined ? { minimumExtensionVersion } : {}),
      ...(body && 'allowRoles' in body ? { allowRoles } : {}),
      ...(body && 'allowUsers' in body ? { allowUsers } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<FeatureFlagUpdateResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to update feature flag right now.';

    return badRequest(fallbackMessage ?? 'Unable to update feature flag right now.', response.status || 500);
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
