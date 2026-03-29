import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../components/site-shell';
import { buildAccessMatrixRows } from '../../features/navigation/access-matrix';
import { getVisibleAdminSections } from '../../features/navigation/visibility';
import { getAccessTokenFromCookies } from '../../lib/auth-session';
import {
  getAdminUsers,
  getFeatureFlags,
  getFoundation,
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
  const [session, foundation, featureFlags, adminUsers, supportImpersonationSessions] = await Promise.all([
    getSession(persona, accessToken),
    getFoundation(),
    getFeatureFlags(persona, accessToken),
    getAdminUsers(persona, accessToken),
    getSupportImpersonationSessions(persona, accessToken),
  ]);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceId = session?.workspaces[0]?.id;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context, workspaceId) : [];
  const sectionAccessRows = context
    ? buildAccessMatrixRows({
        context,
        workspaceId,
      }).filter((row) => row.scope === 'admin')
    : [];
  const blockedSectionRows = sectionAccessRows.filter((row) => !row.allowed);

  return (
    <SiteShell
      apiState={
        session ? `Connected ${sessionLabel}` : 'Session unavailable'
      }
      currentPersona={persona}
      description="Admin routes are intentionally stricter: some personas can inspect users, others can publish control-plane changes, and viewers are blocked entirely."
      eyebrow="Admin"
      pathname="/admin"
      showPersonaSwitcher={false}
      title="Platform administration"
    >
      {session ? (
        <>
          {visibleSections.length > 0 ? (
            <>
              {/* ── Section cards ── */}
              <section className="section-grid">
                {visibleSections.map((section) => (
                  <a key={section.id} href={section.href} className="section-card section-card--link">
                    <h2>{section.title}</h2>
                    <p>{section.description}</p>
                    <span className="list-muted monospace">{section.href}</span>
                  </a>
                ))}
              </section>

              {/* ── Users + Permissions ── */}
              <section className="split-grid">
                <article className="panel">
                  <span className="micro-label">Users</span>
                  <h2>Directory visibility</h2>
                  <div className="tag-row" style={{ marginBottom: '12px' }}>
                    <span className={adminUsers?.accessDecision.allowed ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
                      {adminUsers?.accessDecision.allowed ? 'directory visible' : 'directory restricted'}
                    </span>
                  </div>
                  {(adminUsers?.items ?? []).slice(0, 5).map((user) => (
                    <div className="kv-row" key={user.id}>
                      <span className="kv-row__key">{user.displayName || 'Unnamed'}</span>
                      <span className="kv-row__value">{user.email}</span>
                    </div>
                  ))}
                </article>

                <article className="panel">
                  <span className="micro-label">Permissions</span>
                  <h2>Resolved capability sample</h2>
                  <div className="tag-row">
                    {(featureFlags?.permissions ?? session.permissions).slice(0, 12).map((permission) => (
                      <span className="tag" key={permission}>{permission}</span>
                    ))}
                  </div>
                </article>
              </section>

              {/* ── Routes ── */}
              <section className="panel">
                <span className="micro-label">Routes</span>
                <h2>Admin endpoint inventory</h2>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(foundation?.routes ?? [])
                        .filter((route) => route.path.startsWith('/admin') || route.path.startsWith('/support'))
                        .map((route) => (
                          <tr key={`${route.method}:${route.path}`}>
                            <td><span className="tag-soft tag-soft--gray">{route.method}</span></td>
                            <td><code style={{ fontSize: '0.82rem' }}>{route.path}</code></td>
                            <td className="list-muted" style={{ fontSize: '0.84rem' }}>{route.summary}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {supportImpersonationSessions?.accessDecision.allowed ? (
                <section className="panel">
                  <span className="micro-label">Support</span>
                  <h2>Recent impersonation sessions</h2>
                  <div className="tag-row" style={{ marginBottom: '12px' }}>
                    <span className="tag-soft tag-soft--gray">
                      {supportImpersonationSessions.items.length} recent{supportImpersonationSessions.items.length === 1 ? ' session' : ' sessions'}
                    </span>
                  </div>
                  {supportImpersonationSessions.items.length > 0 ? (
                    <div className="event-list">
                      {supportImpersonationSessions.items.map((item) => (
                        <div className="event-row" key={item.impersonationSessionId}>
                          <span className="event-dot event-dot--warn" />
                          <div className="event-row__body">
                            <span className="event-row__type">
                              {item.supportActor.displayName || item.supportActor.email}
                              {' → '}
                              {item.targetUser.displayName || item.targetUser.email}
                            </span>
                            <p className="event-row__summary">{item.reason}</p>
                          </div>
                          <div className="event-row__meta">
                            {item.workspace ? <><span className="tag-soft tag-soft--gray">{item.workspace.name}</span><br /></> : null}
                            {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="list-muted">No impersonation sessions started yet in this environment.</p>
                  )}
                </section>
              ) : null}
            </>
          ) : (
            <section className="empty-state">
              <span className="micro-label">Access blocked</span>
              <h2>No admin routes available for this session</h2>
              <p>
                The account is authenticated, but required admin permissions are missing. Inspect the access matrix below
                for exact route-level denials.
              </p>
            </section>
          )}

          {/* ── Access matrix ── */}
          <section className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div>
                <span className="micro-label">Access matrix</span>
                <h2>Admin route permissions</h2>
              </div>
              <div className="tag-row">
                <span className="tag-soft tag-soft--green">{sectionAccessRows.length - blockedSectionRows.length} allowed</span>
                {blockedSectionRows.length > 0 ? (
                  <span className="tag-soft tag-soft--orange">{blockedSectionRows.length} blocked</span>
                ) : null}
              </div>
            </div>
            <div className="access-matrix">
              {sectionAccessRows.map((row) => (
                <div className="access-row" key={`admin-matrix:${row.id}`}>
                  <span className={row.allowed ? 'access-row__dot access-row__dot--allowed' : 'access-row__dot access-row__dot--blocked'} />
                  <span className="access-row__title">{row.title}</span>
                  <span className="access-row__scope">{row.href}</span>
                  {!row.allowed && row.reason ? (
                    <span className="access-row__reason">{row.reason}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in</span>
          <h2>Open a connected session to inspect admin routes.</h2>
          <p>Admin route visibility and permission diagnostics require an authenticated session.</p>
        </section>
      )}
    </SiteShell>
  );
}



