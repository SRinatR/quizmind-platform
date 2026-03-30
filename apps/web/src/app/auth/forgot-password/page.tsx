import { AuthShell } from '../auth-shell';
import { ForgotPasswordClient } from './forgot-password-client';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      description="Enter your email address and we will send you a link to reset your password."
      eyebrow="QuizMind"
      highlights={[
        {
          eyebrow: 'Simple',
          title: 'Check your inbox',
          description: 'A reset link will arrive within a few minutes. Check your spam folder if you don\'t see it.',
        },
        {
          eyebrow: 'Secure',
          title: 'Links expire automatically',
          description: 'For your protection, password reset links are only valid for a limited time.',
        },
        {
          eyebrow: 'Private',
          title: 'Your account stays confidential',
          description: 'We don\'t confirm whether an account exists for a given email address.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to home' },
        { href: '/auth/login', label: 'Sign in' },
        { href: '/auth/register', label: 'Create account' },
      ]}
      title="Reset your password."
    >
      <ForgotPasswordClient />
    </AuthShell>
  );
}
