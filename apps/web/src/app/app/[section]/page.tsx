import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, resolvePersona } from '../../../lib/api';
import { getVisibleDashboardSections } from '../../../features/navigation/visibility';

interface AppSectionPageProps {
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AppSectionPage({ params, searchParams }: AppSectionPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceId = session?.workspaces[0]?.id;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context, workspaceId) : [];
  const section = visibleSections.find((item) => item.href.endsWith(`/${resolvedParams.section}`));

  return (
    <SiteShell
      apiState={
        session ? `Connected ${sessionLabel}` : 'Session unavailable'
      }
      currentPersona={persona}
      description="Each dashboard route can be opened directly, but its availability still follows the permission and entitlement model."
      eyebrow="App Route"
      pathname={`/app/${resolvedParams.section}`}
      showPersonaSwitcher={false}
      title={section?.title ?? 'Section unavailable'}
    >
      {section && session ? (
        <section className="split-grid">
          <article className="panel">
            <span className="micro-label">Section</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
            <span className="tag">{session.personaLabel}</span>
          </article>
          <article className="panel">
            <span className="micro-label">Context</span>
            <h2>Current workspace state</h2>
            <p>
              Workspace: {session.workspaces[0]?.name ?? 'n/a'}
              <br />
              Role: {session.workspaces[0]?.role ?? 'n/a'}
            </p>
          </article>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Route Gate</span>
          <h2>This persona cannot open this dashboard route.</h2>
          <p>
            Switch personas above or return to `/app` to see only the sections available for the current access
            context.
          </p>
        </section>
      )}
    </SiteShell>
  );
}



