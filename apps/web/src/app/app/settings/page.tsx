import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../../components/site-shell';
import { buildAccessMatrixRows } from '../../../features/navigation/access-matrix';
import { getVisibleDashboardSections } from '../../../features/navigation/visibility';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getAuthSessions,
  getProviderCatalog,
  getProviderCredentialInventory,
  getSession,
  getUserProfile,
  resolvePersona,
} from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { SettingsPageClient } from './settings-page-client';

interface SettingsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceId = session?.workspaces[0]?.id;
  const userProfile = await getUserProfile(accessToken);
  const authSessions = await getAuthSessions(accessToken);
  const providerCatalog = await getProviderCatalog();
  const providerCredentialInventory = await getProviderCredentialInventory(workspaceId, accessToken);
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context, workspaceId) : [];
  const accessMatrix = context ? buildAccessMatrixRows({ context, workspaceId }) : [];
  const isAdmin = session ? isAdminSession(session) : false;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Settings"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app/settings"
      showPersonaSwitcher={false}
      title="Account &amp; workspace"
    >
      {session ? (
        <SettingsPageClient
          authSessions={authSessions}
          isAdmin={isAdmin}
          isConnectedSession={isConnectedSession}
          providerCatalog={providerCatalog}
          providerCredentialInventory={providerCredentialInventory}
          session={session}
          userProfile={userProfile}
          accessMatrix={accessMatrix}
          visibleSections={visibleSections}
        />
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in required</span>
          <h2>Sign in to manage your settings</h2>
          <p>Account, session, and workspace settings require an authenticated session.</p>
        </section>
      )}
    </SiteShell>
  );
}
