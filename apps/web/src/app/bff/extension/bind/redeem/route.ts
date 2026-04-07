import { NextResponse } from 'next/server';
import { type ExtensionInstallationBindResult } from '@quizmind/contracts';

import {
  normalizeBridgeOrigin,
  redeemBindFallbackCode,
} from '../../../../../lib/extension-bind-code-store';

interface RedeemBindCodeBody {
  code?: string;
  installationId?: string;
  requestId?: string;
  bridgeNonce?: string;
}

interface RouteErrorPayload {
  ok: false;
  error: {
    code: 'invalid_or_expired' | 'context_mismatch' | 'store_unavailable';
    message: string;
  };
}

interface RouteSuccessPayload {
  ok: true;
  data: ExtensionInstallationBindResult;
  redeemedAt: string;
}

function buildCorsHeaders(originHeader?: string): Record<string, string> {
  const normalizedOrigin = normalizeBridgeOrigin(originHeader);

  if (!normalizedOrigin) {
    return {};
  }

  return {
    'access-control-allow-origin': normalizedOrigin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(request.headers.get('origin') ?? undefined),
  });
}

export async function POST(request: Request) {
  const requestOrigin = request.headers.get('origin') ?? undefined;
  const body = (await request.json().catch(() => null)) as RedeemBindCodeBody | null;
  const result = await redeemBindFallbackCode({
    code: typeof body?.code === 'string' ? body.code : undefined,
    installationId: typeof body?.installationId === 'string' ? body.installationId : undefined,
    requestId: typeof body?.requestId === 'string' ? body.requestId : undefined,
    bridgeNonce: typeof body?.bridgeNonce === 'string' ? body.bridgeNonce : undefined,
    requestOrigin,
  });

  if (!result.ok) {
    return NextResponse.json<RouteErrorPayload>(
      {
        ok: false,
        error: {
          code: result.code,
          message: result.message,
        },
      },
      {
        status:
          result.code === 'invalid_or_expired'
            ? 404
            : result.code === 'context_mismatch'
              ? 403
              : 503,
        headers: buildCorsHeaders(requestOrigin),
      },
    );
  }

  return NextResponse.json<RouteSuccessPayload>(
    {
      ok: true,
      data: result.result,
      redeemedAt: result.redeemedAt,
    },
    {
      headers: buildCorsHeaders(requestOrigin),
    },
  );
}
