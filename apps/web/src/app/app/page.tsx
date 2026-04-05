import { SiteShell } from '../../components/site-shell';
import { getAccessTokenFromCookies } from '../../lib/auth-session';
import { getSession, getUserProfile, getWalletBalance, resolvePersona } from '../../lib/api';
import { isAdminSession } from '../../lib/admin-guard';
import { ServerPrefsSync } from '../../lib/preferences';
import { getExchangeRates } from '../../lib/exchange-rates';
import { ProfilePageClient, ProfileSignInPrompt } from './dashboard-content-client';

interface AppPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AppDashboardPage({ searchParams }: AppPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const isAdmin = session ? isAdminSession(session) : false;

  const [userProfile, walletBalance, exchangeRates] = await Promise.all([
    getUserProfile(accessToken),
    accessToken ? getWalletBalance(accessToken) : Promise.resolve(null),
    getExchangeRates(),
  ]);

  const canManageBilling = Boolean(isConnectedSession && session);

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Profile"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app"
      showPersonaSwitcher={false}
      title="Your Profile"
      userDisplayName={session?.user.displayName ?? undefined}
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      {/* Restore server-saved preferences on page load */}
      <ServerPrefsSync serverPrefs={userProfile?.uiPreferences ?? null} />

      {session ? (
        <ProfilePageClient
          canManageBilling={canManageBilling}
          initialBalance={walletBalance}
          isConnectedSession={isConnectedSession}
          session={session}
          userProfile={userProfile}
          exchangeRates={exchangeRates}
        />
      ) : (
        <ProfileSignInPrompt />
      )}
    </SiteShell>
  );
}
