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
  const usage = workspaceId ? await getUsageSummary(persona, workspaceId, accessToken) : null;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context, workspaceId) : [];
  const isAdmin = session ? isAdminSession(session) : false;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Dashboard"
      isAdmin={isAdmin}
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
                </Link>
              ))}
            </section>
          ) : null}

          {/* ── Session + workspace ── */}
          <section className="split-grid">
            <article className="panel">
              <span className="micro-label">Account</span>
              <h2>{session.user.displayName ?? session.user.email}</h2>
              <p>{session.user.email}</p>
            </article>

            <article className="panel">
              <span className="micro-label">Workspace</span>
              <h2>{session.workspaces[0]?.name ?? 'No workspace'}</h2>
              <div className="list-stack">
                {session.workspaces.map((workspace) => (
                  <div className="list-item" key={workspace.id}>
                    <strong>{workspace.name}</strong>
                    <p>{workspace.slug} &middot; {workspace.role}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          {/* ── Usage ── */}
          {usage ? (
            <section className="panel">
              <span className="micro-label">Usage</span>
              <h2>Quota overview</h2>
              <div className="list-stack">
                {usage.quotas.slice(0, 4).map((quota) => (
                  <div className="list-item" key={quota.key}>
                    <strong>{quota.label}</strong>
                    <p>
                      {quota.consumed}
                      {typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''}{' '}
                      &middot; {quota.status}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Not signed in</span>
          <h2>Sign in to view your dashboard</h2>
          <p>Your workspace, usage, and extension activity will appear here.</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <Link className="btn-primary" href="/auth/login">Sign in</Link>
            <Link className="btn-ghost" href="/">Back to home</Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}
