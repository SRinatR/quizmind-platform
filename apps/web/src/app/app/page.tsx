import Link from 'next/link';
import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../components/site-shell';
import { getAccessTokenFromCookies } from '../../lib/auth-session';
import { getSession, getUsageSummary, resolvePersona } from '../../lib/api';
import { isAdminSession } from '../../lib/admin-guard';
import { getVisibleDashboardSections } from '../../features/navigation/visibility';

interface AppPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AppDashboardPage({ searchParams }: AppPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceId = session?.workspaces[0]?.id;
  const workspaceName = session?.workspaces[0]?.name;
  const usage = workspaceId ? await getUsageSummary(persona, workspaceId, accessToken) : null;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context, workspaceId) : [];
  const isAdmin = session ? isAdminSession(session) : false;
  const primaryWorkspace = session?.workspaces[0] ?? null;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Dashboard"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app"
      showPersonaSwitcher={false}
      title="Overview"
      workspaceName={workspaceName}
      userDisplayName={session?.user.displayName ?? undefined}
    >
      {session ? (
        <>
          {/* ── Stats row ── */}
          <section className="metrics-grid">
            <article className="stat-card">
              <span className="micro-label">Account</span>
              <p className="stat-value stat-value--sm">
                {session.user.displayName ?? session.user.email?.split('@')[0] ?? '\u2014'}
              </p>
              <p className="metric-copy">{session.user.email}</p>
            </article>

            <article className="stat-card">
              <span className="micro-label">Workspace</span>
              <p className="stat-value stat-value--sm">
                {primaryWorkspace?.name ?? '\u2014'}
              </p>
              <p className="metric-copy">
                {primaryWorkspace ? primaryWorkspace.role : 'No workspace linked'}
              </p>
            </article>

            <article className="stat-card">
              <span className="micro-label">Features</span>
              <p className="stat-value">{visibleSections.length}</p>
              <p className="metric-copy">Accessible sections</p>
            </article>

            <article className="stat-card">
              <span className="micro-label">Session</span>
              <p className="stat-value stat-value--sm stat-value--green">Active</p>
              <p className="metric-copy">
                {session.personaKey === 'connected-user' ? 'Connected' : session.personaKey}
              </p>
            </article>
          </section>

          {/* ── Usage summary ── */}
          {usage ? (
            <section className="panel">
              <div className="page-section__head">
                <span className="page-section__label">Usage</span>
                <Link href="/app/usage" className="page-section__action-link">
                  View details \u2192
                </Link>
              </div>
              <div className="dashboard-quota-grid">
                {usage.quotas.slice(0, 4).map((quota) => {
                  const pct =
                    typeof quota.limit === 'number' && quota.limit > 0
                      ? Math.min(100, Math.round((quota.consumed / quota.limit) * 100))
                      : null;
                  const fillClass =
                    pct == null
                      ? 'quota-bar__fill--unknown'
                      : pct >= 90
                        ? 'quota-bar__fill--critical'
                        : pct >= 70
                          ? 'quota-bar__fill--warn'
                          : 'quota-bar__fill--ok';

                  return (
                    <div className="quota-row" key={quota.key}>
                      <div className="quota-row__header">
                        <span className="quota-row__label">{quota.label}</span>
                        <span className="quota-row__value">
                          {quota.consumed}
                          {typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''}
                        </span>
                      </div>
                      <div className="quota-bar">
                        <div
                          className={`quota-bar__fill ${fillClass}`}
                          style={{ width: pct != null ? `${pct}%` : '100%' }}
                        />
                      </div>
                      <span className="quota-row__period">{quota.status}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ── Quick navigation ── */}
          {visibleSections.length > 0 ? (
            <section className="panel">
              <div className="page-section__head">
                <span className="page-section__label">Quick access</span>
              </div>
              <div className="section-grid">
                {visibleSections.map((section) => (
                  <Link
                    key={section.id}
                    href={section.href}
                    className="section-card section-card--link"
                  >
                    <h2>{section.title}</h2>
                    <p>{section.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── Workspace + extension ── */}
          <section className="split-grid">
            {primaryWorkspace ? (
              <article className="panel">
                <span className="micro-label">Workspace</span>
                <h2>{primaryWorkspace.name}</h2>
                <div className="kv-list">
                  <div className="kv-row">
                    <span className="kv-row__key">Slug</span>
                    <span className="kv-row__value">{primaryWorkspace.slug}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__key">Your role</span>
                    <span className="kv-row__value">{primaryWorkspace.role}</span>
                  </div>
                  {session.workspaces.length > 1 ? (
                    <div className="kv-row">
                      <span className="kv-row__key">Total workspaces</span>
                      <span className="kv-row__value">{session.workspaces.length}</span>
                    </div>
                  ) : null}
                </div>
                <div className="link-row">
                  <Link className="btn-ghost" href="/app/billing">Billing</Link>
                  <Link className="btn-ghost" href="/app/settings">Settings</Link>
                </div>
              </article>
            ) : (
              <article className="panel">
                <div className="empty-state">
                  <span className="empty-state-icon" aria-hidden="true">\uD83C\uDFE2</span>
                  <span className="micro-label">No workspace</span>
                  <h2>No workspace linked</h2>
                  <p>Contact your administrator to link your account to a workspace.</p>
                  <Link className="btn-ghost" href="/app/settings">View settings</Link>
                </div>
              </article>
            )}

            <article className="panel">
              <span className="micro-label">Extension</span>
              <h2>Browser extension</h2>
              <p>
                Install the QuizMind Chrome extension to start getting AI-powered answers
                directly in your browser.
              </p>
              <div className="link-row">
                <Link className="btn-primary" href="/app/installations">
                  View installations
                </Link>
                <Link className="btn-ghost" href="/app/extension">
                  Extension settings
                </Link>
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">\uD83D\uDD10</span>
          <span className="micro-label">Authentication required</span>
          <h2>Sign in to access your dashboard</h2>
          <p>Your workspace, usage metrics, and extension activity will appear here.</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <Link className="btn-primary" href="/auth/login">Sign in</Link>
            <Link className="btn-ghost" href="/">Back to home</Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}
