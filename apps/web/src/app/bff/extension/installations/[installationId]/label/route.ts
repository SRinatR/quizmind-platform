import { NextResponse } from 'next/server';
import { type ExtensionInstallationLabelUpdateRequest, type ExtensionInstallationLabelUpdateResult } from '@quizmind/contracts';
import { API_URL, type ApiEnvelope } from '../../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../../lib/auth-session';

export async function PATCH(request: Request, context: { params: Promise<{ installationId: string }> }) {
  const accessToken = await getAccessTokenFromCookies();
  if (!accessToken) return NextResponse.json({ ok: false, error: { message: 'Sign in to rename devices.' } }, { status: 401 });

  const params = await context.params;
  const body = (await request.json().catch(() => null)) as Partial<ExtensionInstallationLabelUpdateRequest> | null;
  const response = await fetch(`${API_URL}/extension/installations/${params.installationId}/label`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ deviceLabel: body?.deviceLabel ?? null }),
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<ExtensionInstallationLabelUpdateResult> | { message?: string | string[] } | null;
  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const message = payload && 'message' in payload ? (Array.isArray(payload.message) ? payload.message[0] : payload.message) : 'Failed to update device name.';
    return NextResponse.json({ ok: false, error: { message } }, { status: response.status || 500 });
  }

  return NextResponse.json({ ok: true, data: payload.data }, { status: response.status });
}
