import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getBillingInvoices,
  getBillingPlans,
  getSession,
  getSubscription,
  resolvePersona,
} from '../../../lib/api';
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
  const requestedWorkspaceId = readSearchParam(resolvedSearchParams?.workspaceId);
  const workspaceId =
    requestedWorkspaceId && session?.workspaces.some((workspace) => workspace.id === requestedWorkspaceId)
      ? requestedWorkspaceId
      : session?.workspaces[0]?.id;
  const subscription = workspaceId ? await getSubscription(persona, workspaceId, accessToken) : null;
  const plans = await getBillingPlans();
  const invoices = accessToken && workspaceId ? await getBillingInvoices(workspaceId, accessToken) : null;
  const canManageBilling = Boolean(isConnectedSession && subscription?.accessDecision.allowed);

  return (
    <SiteShell
      apiState={
        session ? `Connected ${sessionLabel}` : 'Session unavailable'
      }
      currentPersona={persona}
      description="Current plan, upgrade paths, invoices, and cancellation controls are all driven from the same billing endpoints and Stripe integration wired in the API."
      eyebrow="Billing"
      pathname="/app/billing"
      showPersonaSwitcher={false}
      title="Workspace billing"
    >
      {session && workspaceId && subscription && plans ? (
        <BillingPageClient
          canManageBilling={canManageBilling}
          initialInvoices={invoices}
          initialPlans={plans}
          initialSubscription={subscription}
          isConnectedSession={isConnectedSession}
          workspaceId={workspaceId}
        />
      ) : session ? (
        <section className="empty-state">
          <span className="micro-label">Billing access</span>
          <h2>Billing data is not available for this workspace yet.</h2>
          <p>
            The session is active, but billing could not be hydrated from the API. This usually means the workspace
            has no accessible subscription snapshot yet or the API is still starting.
          </p>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in</span>
          <h2>Open a connected session to manage live billing.</h2>
          <p>
            Billing actions like upgrade, portal access, cancellation, and invoice history require an authenticated
            dashboard session.
          </p>
          <div className="billing-inline-actions">
            <Link className="btn-primary" href="/auth/login?next=/app/billing">
              Sign in
            </Link>
            <Link className="btn-ghost" href="/pricing">
              View pricing
            </Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}



