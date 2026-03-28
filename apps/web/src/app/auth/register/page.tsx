import { AuthShell } from '../auth-shell';
import { resolveNextPath, withNextPath } from '../search-params';
import { getSession } from '../../../lib/api';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { RegisterClient } from './register-client';

interface RegisterPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = resolveNextPath(resolvedSearchParams?.next);
  const accessToken = await getAccessTokenFromCookies();
  const currentSession = accessToken ? await getSession('platform-admin', accessToken) : null;

  return (
    <AuthShell
      description="The registration flow now issues a real connected session, sends a verification email, and feeds directly into the production auth surface instead of a static placeholder."
      eyebrow="QuizMind Platform"
      highlights={[
        {
          eyebrow: 'Connected auth',
          title: 'Real Nest + Prisma session',
          description: 'Registration now creates the same access and refresh tokens used by the dashboard and admin surfaces.',
        },
        {
          eyebrow: 'Email verification',
          title: 'Inbox ownership is explicit',
          description: 'New accounts immediately receive a verification link so we can enforce safer recovery and account changes.',
        },
        {
          eyebrow: 'Next step',
          title: 'Recovery flow is live too',
          description: 'Forgot-password and reset-password now run on the same connected auth stack.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to landing' },
        { href: withNextPath('/auth/login', nextPath), label: 'Sign in' },
        { href: '/pricing', label: 'View pricing' },
      ]}
      title="Create the first secure session."
    >
      <RegisterClient initialSession={currentSession} nextPath={nextPath} />
    </AuthShell>
  );
}
