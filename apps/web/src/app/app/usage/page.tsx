import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getAiAnalytics, getSession, getUserProfile, resolvePersona } from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { getExchangeRates } from '../../../lib/exchange-rates';
import { ServerPrefsSync } from '../../../lib/preferences';
import { UsagePageClient } from './usage-page-client';

interface UsagePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const [session, userProfile, exchangeRates] = await Promise.all([
    getSession(persona, accessToken),
    getUserProfile(accessToken),
    getExchangeRates(),
  ]);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const isAdmin = session ? isAdminSession(session) : false;

  const fromParam = readSearchParam(resolvedSearchParams?.from);
  const toParam = readSearchParam(resolvedSearchParams?.to);

  // Default to last 30 days.
  const toDate = toParam ? new Date(toParam) : new Date();
  const fromDate = fromParam
    ? new Date(fromParam)
    : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const analytics = await getAiAnalytics(
    {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    accessToken,
  );

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Usage"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app/usage"
      showPersonaSwitcher={false}
      title="Account usage"
      userDisplayName={session?.user.displayName ?? undefined}
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      <ServerPrefsSync serverPrefs={userProfile?.uiPreferences ?? null} />
      <UsagePageClient
        session={session}
        analytics={analytics}
        fromDate={fromDate.toISOString().slice(0, 10)}
        toDate={toDate.toISOString().slice(0, 10)}
        exchangeRates={exchangeRates}
      />
    </SiteShell>
  );
}
