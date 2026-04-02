import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../components/site-shell';
import { getAccessTokenFromCookies } from '../../lib/auth-session';
import { getSession, getUsageSummary, resolvePersona } from '../../lib/api';
import { isAdminSession } from '../../lib/admin-guard';
import { getVisibleDashboardSections } from '../../features/navigation/visibility';
import { DashboardContentClient, DashboardSignInPrompt } from './dashboard-content-client';

interface AppPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AppDashboardPage({ searchParams }: AppPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  // workspaceId kept internally as compatibility layer — not exposed in UI
  const workspaceId = session?.workspaces[0]?.id;
  const usage = workspaceId ? await getUsageSummary(persona, workspaceId, accessToken) : null;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context) : [];
  const isAdmin = session ? isAdminSession(session) : false;

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
      userDisplayName={session?.user.displayName ?? undefined}
    >
      {session ? (
        <DashboardContentClient
          session={session}
          usage={usage}
          visibleSections={visibleSections}
        />
      ) : (
        <DashboardSignInPrompt />
      )}
    </SiteShell>
  );
}
