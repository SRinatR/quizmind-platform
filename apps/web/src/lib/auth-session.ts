import 'server-only';

import { REFRESH_TOKEN_LIFETIME_DAYS } from '@quizmind/auth';
import { type AuthSessionPayload } from '@quizmind/contracts';
import { cookies } from 'next/headers';

const accessTokenCookieName = 'quizmind_access_token';
const refreshTokenCookieName = 'quizmind_refresh_token';

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function getAccessTokenFromCookies() {
  const cookieStore = await cookies();

  return cookieStore.get(accessTokenCookieName)?.value ?? null;
}

export async function getRefreshTokenFromCookies() {
  const cookieStore = await cookies();

  return cookieStore.get(refreshTokenCookieName)?.value ?? null;
}

export async function persistAuthSession(session: AuthSessionPayload) {
  const cookieStore = await cookies();

  cookieStore.set(accessTokenCookieName, session.accessToken, {
    ...baseCookieOptions,
    expires: new Date(session.expiresAt),
  });

  cookieStore.set(refreshTokenCookieName, session.refreshToken, {
    ...baseCookieOptions,
    maxAge: REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60,
  });
}

export async function clearAuthSession() {
  const cookieStore = await cookies();

  cookieStore.set(accessTokenCookieName, '', {
    ...baseCookieOptions,
    maxAge: 0,
  });

  cookieStore.set(refreshTokenCookieName, '', {
    ...baseCookieOptions,
    maxAge: 0,
  });
}
