import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getSession,
  getWalletBalance,
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
  const session = await getSession(persona, accessToken);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;

  const [walletBalance, walletTopUps] = await Promise.all([
    accessToken ? getWalletBalance(accessToken) : Promise.resolve(null),
    accessToken ? getWalletTopUps(accessToken) : Promise.resolve(null),
  ]);

  const canManageBilling = Boolean(isConnectedSession && session);
  const isAdmin = session ? isAdminSession(session) : false;

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
    >
      {session ? (
        <BillingPageClient
          canManageBilling={canManageBilling}
          initialBalance={walletBalance}
          initialTopUps={walletTopUps?.items ?? []}
          isConnectedSession={isConnectedSession}
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
