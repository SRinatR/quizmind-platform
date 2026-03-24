import { AuthShell } from '../auth-shell';
import { readBooleanSearchParam, readSearchParam, resolveNextPath } from '../search-params';
import { VerifyClient } from './verify-client';

interface VerifyPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const resolvedSearchParams = await searchParams;
  const email = readSearchParam(resolvedSearchParams?.email);
  const token = readSearchParam(resolvedSearchParams?.token);
  const nextPath = resolveNextPath(resolvedSearchParams?.next);
  const initialSent = readBooleanSearchParam(resolvedSearchParams?.sent);
  const initialVerified = readBooleanSearchParam(resolvedSearchParams?.verified);

  return (
    <AuthShell
      description="Email verification is now wired to the live API. The page can both guide a just-registered user and redeem a verification token from the transactional email."
      eyebrow="QuizMind Platform"
      highlights={[
        {
          eyebrow: 'Ownership',
          title: 'Inbox confirmation is first-class',
          description: 'Verification links now update the real user record instead of stopping at a mocked success screen.',
        },
        {
          eyebrow: 'Flow',
          title: 'Registration and verification connect',
          description: 'After registration, the user lands here with a clear next step instead of a dead end.',
        },
        {
          eyebrow: 'Recovery',
          title: 'Safer password reset posture',
          description: 'Verified inbox ownership makes recovery and future security checks much less fragile.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to landing' },
        { href: '/auth/login', label: 'Sign in' },
        { href: '/auth/register', label: 'Create account' },
      ]}
      title="Confirm inbox ownership before deeper access."
    >
      <VerifyClient
        email={email}
        initialSent={initialSent}
        initialVerified={initialVerified}
        nextPath={nextPath}
        token={token}
      />
    </AuthShell>
  );
}
