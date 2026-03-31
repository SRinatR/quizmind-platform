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
  const currentSession = accessToken ? await getSession('connected-user', accessToken) : null;

  return (
    <AuthShell
      description="Join QuizMind to start using your AI-powered quiz extension."
      eyebrow="QuizMind"
      highlights={[
        {
          eyebrow: 'Instant access',
          title: 'Start in seconds',
          description: 'Your account is ready immediately after sign-up. Connect your extension and go.',
        },
        {
          eyebrow: 'Secure',
          title: 'Email verification included',
          description: 'We verify your inbox so your account stays protected and recoverable.',
        },
        {
          eyebrow: 'Flexible',
          title: 'Works with your workflow',
          description: 'Use your personal workspace or collaborate with a team — your choice.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to home' },
        { href: withNextPath('/auth/login', nextPath), label: 'Sign in' },
      ]}
      title="Create your account."
    >
      <RegisterClient initialSession={currentSession} nextPath={nextPath} />
    </AuthShell>
  );
}
