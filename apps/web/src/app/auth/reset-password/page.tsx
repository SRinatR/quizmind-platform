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
      description="Enter your new password below to regain access to your account."
      eyebrow="QuizMind"
      highlights={[
        {
          eyebrow: 'Secure',
          title: 'Link expires automatically',
          description: 'Reset links are time-limited. Request a new one if yours has expired.',
        },
        {
          eyebrow: 'Protected',
          title: 'All sessions are replaced',
          description: 'Setting a new password signs out all other devices for your security.',
        },
        {
          eyebrow: 'Ready',
          title: 'Continue right away',
          description: 'After reset, you are signed in immediately — no extra steps.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to home' },
        { href: '/auth/login', label: 'Sign in' },
        { href: '/auth/forgot-password', label: 'Request new link' },
      ]}
      title="Set your new password."
    >
      <ResetPasswordClient nextPath={nextPath} token={token} />
    </AuthShell>
  );
}
