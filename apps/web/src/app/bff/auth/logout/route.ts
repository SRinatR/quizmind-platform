import { NextResponse } from 'next/server';

import { API_URL } from '../../../../lib/api';
import { buildForwardedAuthHeaders } from '../../../../lib/bff-forwarding';
import { clearAuthSession, getAccessTokenFromCookies, getRefreshTokenFromCookies } from '../../../../lib/auth-session';

export async function POST(request: Request) {
  const [accessToken, refreshToken] = await Promise.all([getAccessTokenFromCookies(), getRefreshTokenFromCookies()]);

  if (refreshToken || accessToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...buildForwardedAuthHeaders(request),
      },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    }).catch(() => null);
  }

  await clearAuthSession();

  return NextResponse.json({
    ok: true,
  });
}
