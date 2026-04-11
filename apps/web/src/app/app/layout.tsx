import { redirect } from 'next/navigation';
import { type ReactNode } from 'react';
import { getAccessTokenFromCookies } from '../../lib/auth-session';
import { getSession } from '../../lib/api';
import { isAdminSession } from '../../lib/admin-guard';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession('connected-user', accessToken);
  if (session && isAdminSession(session)) {
    redirect('/admin/users');
  }
  return <>{children}</>;
}
