import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getSession,
  getUserProfile,
  getWalletTopUps,
  resolvePersona,
} from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { BillingPageClient } from './billing-page-client';

interface BillingPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const [session, userProfile, walletTopUps] = await Promise.all([
    getSession(persona, accessToken),
    getUserProfile(accessToken),
    accessToken ? getWalletTopUps(accessToken) : Promise.resolve(null),
  ]);
  const sessionLabel = session?.user.displayName || session?.user.email;

  const isAdmin = session ? isAdminSession(session) : false;
  const walletTopUpItems = walletTopUps?.items ?? [];

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Billing"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app/billing"
      showPersonaSwitcher={false}
      title="Balance &amp; top-up"
      userDisplayName={session?.user.displayName ?? undefined}
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      {session ? (
        <BillingPageClient
          initialTopUps={walletTopUpItems}
        />
      ) : (
        <section className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">&#x1F510;</span>
          <span className="micro-label">Sign in required</span>
          <h2>Sign in to manage your balance.</h2>
          <p>
            An active session is required to view your balance and add funds.
          </p>
          <div className="billing-inline-actions">
            <Link className="btn-primary" href="/auth/login?next=/app/billing">
              Sign in
            </Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}
