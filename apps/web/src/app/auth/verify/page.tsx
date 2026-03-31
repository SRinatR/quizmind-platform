import { redirect } from 'next/navigation';

/**
 * Email verification is no longer part of the registration flow.
 * Accounts are activated immediately on sign-up.
 * Any legacy verification link lands here and is redirected to sign-in.
 */
export default function VerifyPage() {
  redirect('/auth/login');
}
