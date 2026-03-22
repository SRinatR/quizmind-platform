import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../../components/site-shell';
import { getFeatureFlags, getSession, resolvePersona } from '../../../lib/api';
import { getVisibleAdminSections } from '../../../features/navigation/visibility';

interface AdminSectionPageProps {
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminSectionPage({ params, searchParams }: AdminSectionPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const [session, featureFlags] = await Promise.all([getSession(persona), getFeatureFlags(persona)]);
  const workspaceId = session?.workspaces[0]?.id;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context, workspaceId) : [];
  const section = visibleSections.find((item) => item.href.endsWith(`/${resolvedParams.section}`));

  return (
    <SiteShell
      apiState={session ? `Persona ${session.personaLabel}` : 'API offline fallback'}
      currentPersona={persona}
      description="Admin detail routes reuse the same gating rules as the parent admin shell."
      eyebrow="Admin Route"
      pathname={`/admin/${resolvedParams.section}`}
      title={section?.title ?? 'Admin route unavailable'}
    >
      {section && session ? (
        <section className="split-grid">
          <article className="panel">
            <span className="micro-label">Section</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </article>
          <article className="panel">
            <span className="micro-label">Control-Plane State</span>
            <h2>Feature flag snapshot</h2>
            <div className="list-stack">
              {(featureFlags?.flags ?? []).map((flag) => (
                <div className="list-item" key={flag.key}>
                  <strong>{flag.key}</strong>
                  <p>{flag.status}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Route Gate</span>
          <h2>The current persona cannot access this admin section.</h2>
          <p>
            The route exists, but the access model hides it because the required permissions are not present in
            the computed context.
          </p>
        </section>
      )}
    </SiteShell>
  );
}
