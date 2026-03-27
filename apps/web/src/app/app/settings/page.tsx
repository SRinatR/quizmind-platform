import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getAuthSessions,
  getProviderCatalog,
  getProviderCredentialInventory,
  getSession,
  getSubscription,
  getUserProfile,
  resolvePersona,
} from '../../../lib/api';
import { getVisibleDashboardSections } from '../../../features/navigation/visibility';
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
  const subscription = workspaceId ? await getSubscription(persona, workspaceId, accessToken) : null;
  const userProfile = await getUserProfile(accessToken);
  const authSessions = await getAuthSessions(accessToken);
  const providerCatalog = await getProviderCatalog();
  const providerCredentialInventory = await getProviderCredentialInventory(workspaceId, accessToken);
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleDashboardSections(context, workspaceId) : [];

  return (
    <SiteShell
      apiState={
        session ? (isConnectedSession ? `Connected ${sessionLabel}` : `Persona ${session.personaLabel}`) : 'API offline fallback'
      }
      currentPersona={persona}
      description="Account security, AI access policy, and provider key inventory now come from the live control plane instead of local-only extension state."
      eyebrow="Settings"
      pathname="/app/settings"
      showPersonaSwitcher={!isConnectedSession}
      title="Account and workspace settings"
    >
      {session ? (
        <SettingsPageClient
          authSessions={authSessions}
          isConnectedSession={isConnectedSession}
          providerCatalog={providerCatalog}
          providerCredentialInventory={providerCredentialInventory}
          session={session}
          subscription={subscription}
          userProfile={userProfile}
          visibleSections={visibleSections}
        />
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in</span>
          <h2>Open a connected session to manage account security.</h2>
          <p>Settings, session inventory, and sign-out controls require an authenticated dashboard session.</p>
        </section>
      )}
    </SiteShell>
  );
}
