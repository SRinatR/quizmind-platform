import { NextResponse } from 'next/server';
import {
  type AiProviderPolicyUpdateRequest,
  type AiProviderPolicyUpdateResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

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

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return Array.from(new Set(normalized)).sort();
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to update AI provider policy.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<AiProviderPolicyUpdateRequest> | null;
  const workspaceId =
    body?.workspaceId === undefined ? undefined : typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
  const defaultModel =
    body?.defaultModel === undefined
      ? undefined
      : body.defaultModel === null
        ? null
        : typeof body.defaultModel === 'string'
          ? body.defaultModel.trim() || null
          : undefined;
  const reason =
    body?.reason === undefined
      ? undefined
      : body.reason === null
        ? null
        : typeof body.reason === 'string'
          ? body.reason.trim() || null
          : undefined;
  const providers = body && 'providers' in body ? normalizeStringArray(body.providers) : undefined;
  const allowedModelTags = body && 'allowedModelTags' in body ? normalizeStringArray(body.allowedModelTags) : undefined;

  if (body && 'providers' in body && providers === null) {
    return badRequest('providers must be an array of provider ids.');
  }

  if (body && 'allowedModelTags' in body && allowedModelTags === null) {
    return badRequest('allowedModelTags must be an array of strings.');
  }

  const response = await fetch(`${API_URL}/admin/providers/policy`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...(workspaceId !== undefined ? { workspaceId: workspaceId || undefined } : {}),
      ...(body?.mode ? { mode: body.mode } : {}),
      ...(typeof body?.allowPlatformManaged === 'boolean' ? { allowPlatformManaged: body.allowPlatformManaged } : {}),
      ...(typeof body?.allowBringYourOwnKey === 'boolean' ? { allowBringYourOwnKey: body.allowBringYourOwnKey } : {}),
      ...(typeof body?.allowDirectProviderMode === 'boolean'
        ? { allowDirectProviderMode: body.allowDirectProviderMode }
        : {}),
      ...(typeof body?.allowWorkspaceSharedCredentials === 'boolean'
        ? { allowWorkspaceSharedCredentials: body.allowWorkspaceSharedCredentials }
        : {}),
      ...(typeof body?.requireAdminApproval === 'boolean' ? { requireAdminApproval: body.requireAdminApproval } : {}),
      ...(typeof body?.allowVisionOnUserKeys === 'boolean' ? { allowVisionOnUserKeys: body.allowVisionOnUserKeys } : {}),
      ...(providers !== undefined ? { providers } : {}),
      ...(allowedModelTags !== undefined ? { allowedModelTags } : {}),
      ...(body?.defaultProvider !== undefined ? { defaultProvider: body.defaultProvider } : {}),
      ...(defaultModel !== undefined ? { defaultModel } : {}),
      ...(reason !== undefined ? { reason } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<AiProviderPolicyUpdateResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to update AI provider policy right now.';

    return badRequest(fallbackMessage ?? 'Unable to update AI provider policy right now.', response.status || 500);
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
