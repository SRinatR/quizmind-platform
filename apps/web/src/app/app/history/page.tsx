import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getAiHistory,
  getSession,
  getUserProfile,
  resolvePersona,
} from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { getExchangeRates } from '../../../lib/exchange-rates';
import { ServerPrefsSync } from '../../../lib/preferences';
import { HistoryPageClient } from './history-page-client';

interface HistoryPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function normalizePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, 200);
}

function normalizeFilterText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const [session, userProfile, exchangeRates] = await Promise.all([
    getSession(persona, accessToken),
    getUserProfile(accessToken),
    getExchangeRates(),
  ]);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const pageSize = normalizePositiveInt(readSearchParam(resolvedSearchParams?.limit), 25);
  const requestedPage = normalizePositiveInt(readSearchParam(resolvedSearchParams?.page), 1);
  const requestType = normalizeFilterText(readSearchParam(resolvedSearchParams?.requestType));
  const requestStatus = normalizeFilterText(readSearchParam(resolvedSearchParams?.status));
  const modelFilter = normalizeFilterText(readSearchParam(resolvedSearchParams?.model));
  const providerFilter = normalizeFilterText(readSearchParam(resolvedSearchParams?.provider));
  const fromFilter = normalizeFilterText(readSearchParam(resolvedSearchParams?.from));
  const toFilter = normalizeFilterText(readSearchParam(resolvedSearchParams?.to));
  const isAdmin = session ? isAdminSession(session) : false;

  const aiHistory = await getAiHistory(
    {
      limit: pageSize,
      offset: (requestedPage - 1) * pageSize,
      requestType: requestType as never,
      status: requestStatus as never,
      model: modelFilter,
      provider: providerFilter,
      from: fromFilter,
      to: toFilter,
    },
    accessToken,
  );

  const effectivePage = requestedPage;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="History"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app/history"
      showPersonaSwitcher={false}
      title="AI History"
      userDisplayName={session?.user.displayName ?? undefined}
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      <ServerPrefsSync serverPrefs={userProfile?.uiPreferences ?? null} />
      <HistoryPageClient
        aiHistory={aiHistory}
        effectivePage={effectivePage}
        pageSize={pageSize}
        requestType={requestType}
        requestStatus={requestStatus}
        modelFilter={modelFilter}
        providerFilter={providerFilter}
        fromFilter={fromFilter}
        toFilter={toFilter}
        hasSession={Boolean(session)}
        clearHref="/app/history"
        exchangeRates={exchangeRates}
      />
    </SiteShell>
  );
}
