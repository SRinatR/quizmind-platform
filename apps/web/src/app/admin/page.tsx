import Link from 'next/link';
import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../components/site-shell';
import { getVisibleAdminSections } from '../../features/navigation/visibility';
import { getAccessTokenFromCookies } from '../../lib/auth-session';
import { isAdminSession } from '../../lib/admin-guard';
import {
  getAdminUsers,
  getSession,
  getSupportImpersonationSessions,
  resolvePersona,
} from '../../lib/api';

interface AdminPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceId = session?.workspaces[0]?.id;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context, workspaceId) : [];
  const isAdmin = session ? isAdminSession(session) : false;

  // Access guard — non-admin users are shown a clean blocked state
  if (!session || !isAdmin) {
    return (
      <SiteShell
        apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
        currentPersona={persona}
        description=""
        eyebrow="Admin"
        isAdmin={false}
        pathname="/admin"
        showPersonaSwitcher={false}
        title="Access restricted"
      >
        <section className="empty-state">
          <span className="micro-label">Access restricted</span>
          <h2>You don&apos;t have permission to view this area.</h2>
          <p>Admin access is required. If you believe this is a mistake, contact your platform administrator.</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <Link className="btn-primary" href="/app">Go to dashboard</Link>
            {!session ? <Link className="btn-ghost" href="/auth/login">Sign in</Link> : null}
          </div>
        </section>
      </SiteShell>
    );
  }

  // Load admin-specific data only after confirming access
  const [adminUsers, supportImpersonationSessions] = await Promise.all([
    getAdminUsers(persona, accessToken),
    getSupportImpersonationSessions(persona, accessToken),
  ]);

  return (
    <SiteShell
      apiState={`Connected \u2014 ${sessionLabel}`}
      currentPersona={persona}
      description=""
      eyebrow="Admin"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/admin"
      showPersonaSwitcher={false}
      title="Platform administration"
    >
      {visibleSections.length > 0 ? (
        <>
          {/* ── Section cards ── */}
          <section className="section-grid">
            {visibleSections.map((section) => (
              <a key={section.id} href={section.href} className="section-card section-card--link">
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </a>
            ))}
          </section>

          {/* ── Users snapshot ── */}
          {adminUsers?.accessDecision.allowed ? (
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Users</span>
                <h2>Directory</h2>
                <div className="tag-row" style={{ marginBottom: '12px' }}>
                  <span className="tag-soft tag-soft--green">
                    {adminUsers.items.length} user{adminUsers.items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {adminUsers.items.slice(0, 6).map((user) => (
                  <div className="kv-row" key={user.id}>
                    <span className="kv-row__key">{user.displayName || 'Unnamed'}</span>
                    <span className="kv-row__value">{user.email}</span>
                  </div>
                ))}
              </article>

              {supportImpersonationSessions?.accessDecision.allowed ? (
                <article className="panel">
                  <span className="micro-label">Support</span>
                  <h2>Recent impersonation sessions</h2>
                  {supportImpersonationSessions.items.length > 0 ? (
                    <div className="event-list">
                      {supportImpersonationSessions.items.slice(0, 5).map((item) => (
                        <div className="event-row" key={item.impersonationSessionId}>
                          <span className="event-dot event-dot--warn" />
                          <div className="event-row__body">
                            <span className="event-row__type">
                              {item.supportActor.displayName || item.supportActor.email}
                              {' \u2192 '}
                              {item.targetUser.displayName || item.targetUser.email}
                            </span>
                            <p className="event-row__summary">{item.reason}</p>
                          </div>
                          <div className="event-row__meta">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="list-muted">No impersonation sessions yet.</p>
                  )}
                </article>
              ) : null}
            </section>
          ) : null}
        </>
      ) : (
        <section className="empty-state">
          <span className="micro-label">No access</span>
          <h2>No admin sections available for your account</h2>
          <p>Your account is authenticated but lacks the required admin permissions for any section.</p>
          <Link className="btn-ghost" href="/app">Go to dashboard</Link>
        </section>
      )}
    </SiteShell>
  );
}
