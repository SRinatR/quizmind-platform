import { type UsageHistoryRequest, type UsageHistorySourceFilter } from '@quizmind/contracts';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, getUsageHistory, resolvePersona } from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { HistoryPageClient } from './history-page-client';

interface HistoryPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const maxHistoryFetchLimit = 200;

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function normalizeHistorySource(value: string | undefined): UsageHistorySourceFilter {
  if (value === 'activity' || value === 'telemetry' || value === 'ai' || value === 'all') {
    return value;
  }

  return 'all';
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

function escapeCsv(value: string) {
  const normalized = value.replaceAll('"', '""');

  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

function buildHistoryCsv(items: Array<{
  id: string;
  source: string;
  eventType: string;
  severity?: string;
  occurredAt: string;
  installationId?: string;
  actorId?: string;
  summary: string;
}>) {
  const header = ['id', 'source', 'event_type', 'severity', 'occurred_at', 'installation_id', 'actor_id', 'summary'];
  const rows = items.map((item) =>
    [
      item.id,
      item.source,
      item.eventType,
      item.severity ?? '',
      item.occurredAt,
      item.installationId ?? '',
      item.actorId ?? '',
      item.summary,
    ]
      .map((cell) => escapeCsv(cell))
      .join(','),
  );

  return ['\uFEFF' + header.join(','), ...rows].join('\n');
}

function buildQueryParams(input: {
  source: UsageHistorySourceFilter;
  eventType?: string;
  installationId?: string;
  actorId?: string;
  limit: number;
  page: number;
}) {
  const params = new URLSearchParams();

  params.set('source', input.source);
  params.set('limit', String(input.limit));
  params.set('page', String(input.page));

  if (input.eventType) {
    params.set('eventType', input.eventType);
  }

  if (input.installationId) {
    params.set('installationId', input.installationId);
  }

  if (input.actorId) {
    params.set('actorId', input.actorId);
  }

  return params;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  // workspaceId resolved internally from session — compatibility layer, not exposed in UI
  const workspaceId = session?.workspaces[0]?.id;
  const source = normalizeHistorySource(readSearchParam(resolvedSearchParams?.source));
  const pageSize = normalizePositiveInt(readSearchParam(resolvedSearchParams?.limit), 25);
  const requestedPage = normalizePositiveInt(readSearchParam(resolvedSearchParams?.page), 1);
  const fetchLimit = Math.min(requestedPage * pageSize, maxHistoryFetchLimit);
  const eventType = normalizeFilterText(readSearchParam(resolvedSearchParams?.eventType));
  const installationId = normalizeFilterText(readSearchParam(resolvedSearchParams?.installationId));
  const actorId = normalizeFilterText(readSearchParam(resolvedSearchParams?.actorId));
  const historyRequest: Partial<UsageHistoryRequest> = {
    source,
    limit: fetchLimit,
    ...(workspaceId ? { workspaceId } : {}),
    ...(eventType ? { eventType } : {}),
    ...(source !== 'activity' && installationId ? { installationId } : {}),
    ...(source !== 'telemetry' && actorId ? { actorId } : {}),
  };
  const history = workspaceId ? await getUsageHistory(persona, historyRequest, accessToken) : null;
  const isAdmin = session ? isAdminSession(session) : false;
  const effectivePage = history
    ? Math.min(requestedPage, Math.max(1, Math.ceil(history.items.length / pageSize)))
    : requestedPage;
  const sliceStart = (effectivePage - 1) * pageSize;
  const sliceEnd = sliceStart + pageSize;
  const visibleItems = history ? history.items.slice(sliceStart, sliceEnd) : [];
  const telemetryCount = history?.items.filter((item) => item.source === 'telemetry').length ?? 0;
  const activityCount = history?.items.filter((item) => item.source === 'activity').length ?? 0;
  const aiCount = history?.items.filter((item) => item.source === 'ai').length ?? 0;
  const lastEventAt = history?.items[0]?.occurredAt;
  const hasPreviousPage = effectivePage > 1;
  const hasNextPage = history
    ? history.items.length > sliceEnd || (history.items.length === fetchLimit && fetchLimit < maxHistoryFetchLimit)
    : false;
  const queryParams = buildQueryParams({
    source,
    eventType,
    ...(source !== 'activity' && installationId ? { installationId } : {}),
    ...(source !== 'telemetry' && actorId ? { actorId } : {}),
    limit: pageSize,
    page: effectivePage,
  });
  const previousParams = new URLSearchParams(queryParams);
  const nextParams = new URLSearchParams(queryParams);
  previousParams.set('page', String(Math.max(1, effectivePage - 1)));
  nextParams.set('page', String(effectivePage + 1));
  const previousHref = `/app/history?${previousParams.toString()}`;
  const nextHref = `/app/history?${nextParams.toString()}`;
  const csvContent = buildHistoryCsv(
    visibleItems.map((item) => ({
      id: item.id,
      source: item.source,
      eventType: item.eventType,
      severity: item.severity,
      occurredAt: item.occurredAt,
      installationId: item.installationId,
      actorId: item.actorId,
      summary: item.summary,
    })),
  );
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
  const canExportCsv = Boolean(history?.exportDecision.allowed && visibleItems.length > 0);
  const clearHref = '/app/history';

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
      title="Usage history"
    >
      <HistoryPageClient
        visibleItems={visibleItems}
        totalLoaded={history?.items.length ?? 0}
        fetchLimit={fetchLimit}
        maxFetchLimit={maxHistoryFetchLimit}
        effectivePage={effectivePage}
        pageSize={pageSize}
        hasPrev={hasPreviousPage}
        hasNext={hasNextPage}
        previousHref={previousHref}
        nextHref={nextHref}
        telemetryCount={telemetryCount}
        activityCount={activityCount}
        aiCount={aiCount}
        lastEventAt={lastEventAt}
        source={source}
        eventType={eventType}
        installationId={installationId}
        actorId={actorId}
        canExportCsv={canExportCsv}
        csvHref={csvHref}
        csvFilename={`usage-history-page-${effectivePage}.csv`}
        clearHref={clearHref}
        hasSession={Boolean(session)}
        hasHistory={Boolean(history)}
      />
    </SiteShell>
  );
}
