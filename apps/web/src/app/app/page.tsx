import Link from 'next/link';
import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../components/site-shell';
import { getAccessTokenFromCookies } from '../../lib/auth-session';
import { getSession, getSubscription, getUsageSummary, resolvePersona } from '../../lib/api';
import { getVisibleDashboardSections } from '../../features/navigation/visibility';

interface AppPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AppDashboardPage({ searchParams }: AppPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceId = session?.workspaces[0]?.id;
  const subscription = workspaceId ? await getSubscription(persona, workspaceId, accessToken) : null;
  const usage = workspaceId ? await getUsageSummary(persona, workspaceId, accessToken) : null;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context, workspaceId) : [];

  return (
    <SiteShell
      apiState={
        session ? `Connected ${sessionLabel}` : 'Session unavailable'
      }
      currentPersona={persona}
      description="Your workspace at a glance — session, plan, usage, and available sections."
      eyebrow="Dashboard"
      pathname="/app"
      showPersonaSwitcher={false}
      title="Overview"
    >
      {session ? (
        <>
          {/* ── Quick navigation ── */}
          {visibleSections.length > 0 ? (
            <section className="section-grid">
              {visibleSections.map((section) => (
                <Link
                  key={section.id}
                  href={section.href}
                  className="section-card section-card--link"
                >
                  <h2>{section.title}</h2>
                  <p>{section.description}</p>
                  <span className="list-muted monospace">{section.href}</span>
                </Link>
              ))}
            </section>
          ) : null}

          {/* ── Session + workspace ── */}
          <section className="split-grid">
            <article className="panel">
              <span className="micro-label">Session</span>
              <h2>{session.user.displayName}</h2>
              <p>{session.user.email}</p>
              <div className="tag-row">
                {session.principal.systemRoles.map((role) => (
                  <span className="tag" key={role}>
                    {role}
                  </span>
                ))}
                {session.principal.systemRoles.length === 0 ? (
                  <span className="tag warn">workspace only</span>
                ) : null}
              </div>
              {session.notes.length > 0 ? (
                <div className="mini-list">
                  {session.notes.map((note) => (
                    <div className="list-item" key={note}>
                      <span className="list-muted">{note}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="panel">
              <span className="micro-label">Workspaces</span>
              <h2>Memberships in scope</h2>
              <div className="list-stack">
                {session.workspaces.map((workspace) => (
                  <div className="list-item" key={workspace.id}>
                    <strong>{workspace.name}</strong>
                    <p>
                      {workspace.slug} &middot; {workspace.role}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          {/* ── Subscription + usage ── */}
          <section className="split-grid">
            <article className="panel">
              <span className="micro-label">Subscription</span>
              <h2>{subscription?.workspace.name ?? 'Workspace'} plan</h2>
              {subscription ? (
                <>
                  <div className="tag-row">
                    <span className={subscription.accessDecision.allowed ? 'tag' : 'tag warn'}>
                      {subscription.accessDecision.allowed ? 'billing visible' : 'billing restricted'}
                    </span>
                    <span className="tag">{subscription.summary.planCode}</span>
                    <span className="tag">{subscription.summary.status}</span>
                  </div>
                  <div className="list-stack">
                    {subscription.summary.entitlements.map((entitlement) => (
                      <div className="list-item" key={entitlement.key}>
                        <strong>{entitlement.key}</strong>
                        <p>
                          {String(entitlement.enabled)}
                          {typeof entitlement.limit === 'number' ? ` · limit ${entitlement.limit}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="list-muted">Billing snapshot unavailable — API offline.</p>
              )}
            </article>

            <article className="panel">
              <span className="micro-label">Usage</span>
              <h2>{usage?.workspace.name ?? 'Workspace'} quota health</h2>
              {usage ? (
                <>
                  <div className="tag-row">
                    <span className="tag">{usage.planCode}</span>
                    <span className="tag">{usage.installations.length} installations</span>
                    <span className="tag">{usage.recentEvents.length} recent events</span>
                  </div>
                  <div className="list-stack">
                    {usage.quotas.slice(0, 3).map((quota) => (
                      <div className="list-item" key={quota.key}>
                        <strong>{quota.label}</strong>
                        <p>
                          {quota.consumed}
                          {typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''} &middot; {quota.status}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="list-muted">Usage snapshot unavailable — API offline.</p>
              )}
            </article>
          </section>

          {/* ── Permissions sample ── */}
          {session.permissions.length > 0 ? (
            <section className="panel">
              <span className="micro-label">Permissions</span>
              <h2>Resolved capability sample</h2>
              <div className="tag-row">
                {session.permissions.slice(0, 12).map((permission) => (
                  <span className="tag" key={permission}>
                    {permission}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Offline</span>
          <h2>API not reachable</h2>
          <p>Start <code>apps/api</code> and reload to hydrate dashboard data from the backend.</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <Link className="btn-ghost" href="/auth/login">Sign in</Link>
            <Link className="btn-ghost" href="/">Back to site</Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}
