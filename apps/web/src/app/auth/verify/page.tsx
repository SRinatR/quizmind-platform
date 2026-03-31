import { AuthShell } from '../auth-shell';
import { readBooleanSearchParam, readSearchParam, resolveNextPath, withNextPath } from '../search-params';
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
      description="Verify your email address to secure your account and enable password recovery."
      eyebrow="QuizMind"
      highlights={[
        {
          eyebrow: 'Required',
          title: 'One-time step',
          description: 'Email verification only needs to happen once. You will not be asked again.',
        },
        {
          eyebrow: 'Safe',
          title: 'Protects your account',
          description: 'A verified email makes it easier to recover your account if you ever lose access.',
        },
        {
          eyebrow: 'Quick',
          title: 'Check your inbox',
          description: 'The verification email arrives within a few minutes. Check your spam folder if needed.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to home' },
        { href: withNextPath('/auth/login', nextPath), label: 'Sign in' },
        { href: withNextPath('/auth/register', nextPath), label: 'Create account' },
      ]}
      title="Confirm your email address."
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
