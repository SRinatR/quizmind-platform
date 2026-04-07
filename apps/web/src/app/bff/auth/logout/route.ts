import { NextResponse } from 'next/server';

import { API_URL } from '../../../../lib/api';
import { clearAuthSession, getAccessTokenFromCookies, getRefreshTokenFromCookies } from '../../../../lib/auth-session';

export async function POST() {
  const [accessToken, refreshToken] = await Promise.all([getAccessTokenFromCookies(), getRefreshTokenFromCookies()]);

  if (refreshToken || accessToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    }).catch(() => null);
  }

  await clearAuthSession();

  return NextResponse.json({
    ok: true,
  });
}
