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
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context) : [];
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
      userDisplayName={session?.user.displayName ?? undefined}
    >
      {section && session ? (
        <section className="split-grid">
          <article className="panel">
            <span className="micro-label">Section</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </article>
          <article className="panel">
            <span className="micro-label">Account</span>
            <h2>{session.user.displayName ?? session.user.email?.split('@')[0] ?? '\u2014'}</h2>
            <p>{session.user.email}</p>
          </article>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Not available</span>
          <h2>This section is not accessible with your current account.</h2>
          <p>Return to the dashboard to see what is available for your account.</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <Link className="btn-primary" href="/app">Go to dashboard</Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}
