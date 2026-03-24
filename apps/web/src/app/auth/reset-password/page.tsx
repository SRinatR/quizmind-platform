import { AuthShell } from '../auth-shell';
import { readSearchParam, resolveNextPath } from '../search-params';
import { ResetPasswordClient } from './reset-password-client';

interface ResetPasswordPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const resolvedSearchParams = await searchParams;
  const token = readSearchParam(resolvedSearchParams?.token);
  const nextPath = resolveNextPath(resolvedSearchParams?.next);

  return (
    <AuthShell
      description="This recovery page now lands on a real reset token flow instead of a stub. Successful resets rotate every active session before the browser receives a new one."
      eyebrow="QuizMind Platform"
      highlights={[
        {
          eyebrow: 'Token',
          title: 'Expiring recovery link',
          description: 'Reset links are time-bound and validated against the Prisma-backed password reset table.',
        },
        {
          eyebrow: 'Rotation',
          title: 'Sessions get replaced',
          description: 'When the new password lands, existing sessions are revoked and a fresh session is issued.',
        },
        {
          eyebrow: 'After reset',
          title: 'Straight into the app',
          description: 'The browser receives a connected session cookie so the user can continue without another login prompt.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to landing' },
        { href: '/auth/login', label: 'Sign in' },
        { href: '/auth/forgot-password', label: 'Request reset link' },
      ]}
      title="Rotate access with one secure link."
    >
      <ResetPasswordClient nextPath={nextPath} token={token} />
    </AuthShell>
  );
}
