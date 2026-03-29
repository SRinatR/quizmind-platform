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
              <section className="split-grid">
                <article className="panel">
                  <span className="micro-label">Admin Surface</span>
                  <h2>Visible sections</h2>
                  <div className="list-stack">
                    {visibleSections.map((section) => (
                      <div className="list-item" key={section.id}>
                        <strong>{section.title}</strong>
                        <p>{section.description}</p>
                        <span className="list-muted monospace">{section.href}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <span className="micro-label">Users</span>
                  <h2>Directory visibility</h2>
                  <div className="tag-row">
                    <span className={adminUsers?.accessDecision.allowed ? 'tag' : 'tag warn'}>
                      {adminUsers?.accessDecision.allowed ? 'directory visible' : 'directory restricted'}
                    </span>
                  </div>
                  <div className="list-stack">
                    {(adminUsers?.items ?? []).slice(0, 4).map((user) => (
                      <div className="list-item" key={user.id}>
                        <strong>{user.displayName || user.email}</strong>
                        <p>{user.email}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="split-grid">
                <article className="panel">
                  <span className="micro-label">Routes</span>
                  <h2>Admin endpoint inventory</h2>
                  <div className="list-stack">
                    {(foundation?.routes ?? [])
                      .filter((route) => route.path.startsWith('/admin') || route.path.startsWith('/support'))
                      .map((route) => (
                        <div className="list-item" key={`${route.method}:${route.path}`}>
                          <strong>
                            {route.method} {route.path}
                          </strong>
                          <p>{route.summary}</p>
                        </div>
                      ))}
                  </div>
                </article>

                <article className="panel">
                  <span className="micro-label">Permissions</span>
                  <h2>Resolved permissions sample</h2>
                  <div className="tag-row">
                    {(featureFlags?.permissions ?? session.permissions).slice(0, 10).map((permission) => (
                      <span className="tag" key={permission}>
                        {permission}
                      </span>
                    ))}
                  </div>
                </article>
              </section>

              {supportImpersonationSessions?.accessDecision.allowed ? (
                <section className="panel">
                  <span className="micro-label">Support</span>
                  <h2>Recent impersonation sessions</h2>
                  <div className="tag-row">
                    <span className="tag">
                      {supportImpersonationSessions.items.length} recent
                      {supportImpersonationSessions.items.length === 1 ? ' session' : ' sessions'}
                    </span>
                  </div>
                  {supportImpersonationSessions.items.length > 0 ? (
                    <div className="list-stack">
                      {supportImpersonationSessions.items.map((item) => (
                        <div className="list-item" key={item.impersonationSessionId}>
                          <strong>
                            {item.supportActor.displayName || item.supportActor.email} {'->'}{' '}
                            {item.targetUser.displayName || item.targetUser.email}
                          </strong>
                          <p>{item.reason}</p>
                          <span className="list-muted">
                            {item.workspace ? `${item.workspace.name} | ` : ''}
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No impersonation sessions have been started yet in this environment.</p>
                  )}
                </section>
              ) : null}
            </>
          ) : (
            <section className="empty-state">
              <span className="micro-label">Blocked</span>
              <h2>No admin routes are available for this session.</h2>
              <p>
                The account is authenticated, but required admin permissions are missing. Use the access matrix below
                to inspect exact route-level denials.
              </p>
            </section>
          )}

          <section className="panel">
            <span className="micro-label">Access Matrix</span>
            <h2>Admin route permissions by section</h2>
            <div className="tag-row">
              <span className="tag">allowed {sectionAccessRows.length - blockedSectionRows.length}</span>
              <span className={blockedSectionRows.length > 0 ? 'tag warn' : 'tag'}>
                blocked {blockedSectionRows.length}
              </span>
            </div>
            <div className="list-stack">
              {sectionAccessRows.map((row) => (
                <div className="list-item" key={`admin-matrix:${row.id}`}>
                  <strong>{row.title}</strong>
                  <p>{row.href}</p>
                  <p className="list-muted">{row.requirementSummary}</p>
                  <div className="tag-row">
                    <span className={row.allowed ? 'tag' : 'tag warn'}>{row.allowed ? 'allowed' : 'blocked'}</span>
                    {!row.allowed && row.reason ? <span className="tag warn">{row.reason}</span> : null}
                  </div>
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



