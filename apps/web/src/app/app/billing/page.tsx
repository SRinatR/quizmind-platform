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

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceName = session?.workspaces[0]?.name;
  const requestedWorkspaceId = readSearchParam(resolvedSearchParams?.workspaceId);
  const workspaceId =
    requestedWorkspaceId && session?.workspaces.some((workspace) => workspace.id === requestedWorkspaceId)
      ? requestedWorkspaceId
      : session?.workspaces[0]?.id;

  const [walletBalance, walletTopUps] = await Promise.all([
    accessToken && workspaceId ? getWalletBalance(workspaceId, accessToken) : Promise.resolve(null),
    accessToken && workspaceId ? getWalletTopUps(workspaceId, accessToken) : Promise.resolve(null),
  ]);

  // Billing manager role check: workspace_owner / workspace_admin / workspace_billing_manager can manage billing
  const canManageBilling = Boolean(
    isConnectedSession &&
      session &&
      workspaceId &&
      session.workspaces.some((ws) => ws.id === workspaceId),
  );
  const isAdmin = session ? isAdminSession(session) : false;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Wallet"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app/billing"
      showPersonaSwitcher={false}
      title="Balance &amp; top-up"
      workspaceName={workspaceName}
      userDisplayName={session?.user.displayName ?? undefined}
    >
      {session && workspaceId ? (
        <BillingPageClient
          canManageBilling={canManageBilling}
          initialBalance={walletBalance}
          initialTopUps={walletTopUps?.items ?? []}
          isConnectedSession={isConnectedSession}
          workspaceId={workspaceId}
        />
      ) : session ? (
        <section className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">&#x1F3E2;</span>
          <span className="micro-label">No workspace</span>
          <h2>No workspace linked to your account yet.</h2>
          <p>
            Your session is active but your account is not yet linked to a workspace.
            Contact your administrator to get access.
          </p>
          <div className="billing-inline-actions">
            <Link className="btn-ghost" href="/app/settings">
              View settings
            </Link>
          </div>
        </section>
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
