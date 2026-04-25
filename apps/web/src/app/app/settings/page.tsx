import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getSession,
  getUserProfile,
  resolvePersona,
} from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { ServerPrefsSync } from '../../../lib/preferences';
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
  const userProfile = await getUserProfile(accessToken);
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
      title="Settings"
      userDisplayName={session?.user.displayName ?? undefined}
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      {/* Restore server-saved preferences on page load */}
      <ServerPrefsSync serverPrefs={userProfile?.uiPreferences ?? null} />

      {session ? (
        <SettingsPageClient
          isConnectedSession={isConnectedSession}
        />
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in required</span>
          <h2>Sign in to manage your settings</h2>
          <p>Session and appearance settings require an authenticated session.</p>
        </section>
      )}
    </SiteShell>
  );
}
