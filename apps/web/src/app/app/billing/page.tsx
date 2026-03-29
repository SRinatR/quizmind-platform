import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getSession,
  getWalletBalance,
  getWalletTopUps,
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

  return (
    <SiteShell
      apiState={
        session ? `Connected ${sessionLabel}` : 'Session unavailable'
      }
      currentPersona={persona}
      description="Баланс рабочего пространства, история пополнений и оплата через YooKassa."
      eyebrow="Кошелёк"
      pathname="/app/billing"
      showPersonaSwitcher={!isConnectedSession}
      title="Баланс и пополнение"
    >
      {session && workspaceId ? (
        <BillingPageClient
          canManageBilling={canManageBilling}
          initialBalance={walletBalance}
          initialTopUps={walletTopUps?.items ?? []}
          isConnectedSession={isConnectedSession}
          workspaceId={workspaceId}
        />
      ) : (
        <section className="empty-state">
          <span className="micro-label">Вход в аккаунт</span>
          <h2>Войдите, чтобы управлять балансом.</h2>
          <p>
            Для просмотра баланса и пополнения кошелька необходима активная сессия.
          </p>
          <div className="billing-inline-actions">
            <Link className="btn-primary" href="/auth/login?next=/app/billing">
              Войти
            </Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}



