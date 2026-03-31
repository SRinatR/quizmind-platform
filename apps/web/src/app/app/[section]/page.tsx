import { buildAccessContext } from '@quizmind/auth';
import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, resolvePersona } from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
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
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceId = session?.workspaces[0]?.id;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context, workspaceId) : [];
  const section = visibleSections.find((item) => item.href.endsWith(`/${resolvedParams.section}`));
  const isAdmin = session ? isAdminSession(session) : false;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Dashboard"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname={`/app/${resolvedParams.section}`}
      showPersonaSwitcher={false}
      title={section?.title ?? resolvedParams.section}
    >
      {section && session ? (
        <section className="split-grid">
          <article className="panel">
            <span className="micro-label">Section</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </article>
          <article className="panel">
            <span className="micro-label">Workspace</span>
            <h2>{session.workspaces[0]?.name ?? 'No workspace'}</h2>
            <p>Role: {session.workspaces[0]?.role ?? 'n/a'}</p>
          </article>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Not available</span>
          <h2>This section is not accessible with your current account.</h2>
          <p>Return to the dashboard to see sections available for your workspace.</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <Link className="btn-primary" href="/app">Go to dashboard</Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}
