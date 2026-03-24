import { AuthShell } from '../auth-shell';
import { ForgotPasswordClient } from './forgot-password-client';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      description="Password recovery is now part of the connected auth system. The reset flow issues expiring tokens, sends transactional email, and rotates sessions after a successful reset."
      eyebrow="QuizMind Platform"
      highlights={[
        {
          eyebrow: 'Recovery',
          title: 'Real password reset emails',
          description: 'Reset emails now come from the same transactional email pipeline as account verification.',
        },
        {
          eyebrow: 'Security',
          title: 'Generic response by default',
          description: 'The request response stays generic so we do not leak whether an account exists for a given email.',
        },
        {
          eyebrow: 'Session rotation',
          title: 'Old sessions get revoked',
          description: 'When the reset completes, we revoke active sessions before issuing a fresh one.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to landing' },
        { href: '/auth/login', label: 'Sign in' },
        { href: '/auth/register', label: 'Create account' },
      ]}
      title="Recover access without support tickets."
    >
      <ForgotPasswordClient />
    </AuthShell>
  );
}
