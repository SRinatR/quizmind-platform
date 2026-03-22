import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../components/site-shell';
import { getFeatureFlags, getFoundation, getSession, resolvePersona } from '../../lib/api';
import { getVisibleAdminSections } from '../../features/navigation/visibility';

interface AdminPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const [session, foundation, featureFlags] = await Promise.all([
    getSession(persona),
    getFoundation(),
    getFeatureFlags(persona),
  ]);
  const workspaceId = session?.workspaces[0]?.id;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context, workspaceId) : [];

  return (
    <SiteShell
      apiState={session ? `Persona ${session.personaLabel}` : 'API offline fallback'}
      currentPersona={persona}
      description="Admin routes are intentionally stricter: some personas can inspect users, others can publish control-plane changes, and viewers are blocked entirely."
      eyebrow="Admin"
      pathname="/admin"
      title="Platform administration"
    >
      {session && visibleSections.length > 0 ? (
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
              <span className="micro-label">Feature Flags</span>
              <h2>Publish eligibility</h2>
              <div className="tag-row">
                <span className={featureFlags?.publishDecision.allowed ? 'tag' : 'tag warn'}>
                  {featureFlags?.publishDecision.allowed ? 'can publish' : 'cannot publish'}
                </span>
              </div>
              <div className="list-stack">
                {(featureFlags?.flags ?? []).map((flag) => (
                  <div className="list-item" key={flag.key}>
                    <strong>{flag.key}</strong>
                    <p>{flag.description}</p>
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
        </>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Blocked</span>
          <h2>No admin routes are available for this persona.</h2>
          <p>
            `workspace-viewer` is expected to land here as a denied state. Switch to `platform-admin` or
            `support-admin` to inspect role-based routing.
          </p>
        </section>
      )}
    </SiteShell>
  );
}
