import Link from 'next/link';
import { type UsageHistoryRequest, type UsageHistorySourceFilter } from '@quizmind/contracts';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, getUsageHistory, resolvePersona } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

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

function buildHistoryHref(query: { persona?: string; workspaceId?: string }): string {
  const params = new URLSearchParams();

  if (query.persona) {
    params.set('persona', query.persona);
  }

  if (query.workspaceId) {
    params.set('workspaceId', query.workspaceId);
  }

  const serialized = params.toString();

  return serialized ? `/app/history?${serialized}` : '/app/history';
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
  persona?: string;
  workspaceId?: string;
  source: UsageHistorySourceFilter;
  eventType?: string;
  installationId?: string;
  actorId?: string;
  limit: number;
  page: number;
}) {
  const params = new URLSearchParams();

  if (input.persona) {
    params.set('persona', input.persona);
  }

  if (input.workspaceId) {
    params.set('workspaceId', input.workspaceId);
  }

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
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const requestedWorkspaceId = readSearchParam(resolvedSearchParams?.workspaceId);
  const workspaceId =
    requestedWorkspaceId && session?.workspaces.some((workspace) => workspace.id === requestedWorkspaceId)
      ? requestedWorkspaceId
      : session?.workspaces[0]?.id;
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
    ...(isConnectedSession ? {} : { persona }),
    workspaceId,
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
  const canExportCsv = Boolean(history?.permissions.includes('usage:export') && visibleItems.length > 0);
  const clearHref = buildHistoryHref({
    ...(isConnectedSession ? {} : { persona }),
    ...(workspaceId ? { workspaceId } : {}),
  });

  return (
    <SiteShell
      apiState={
        session ? (isConnectedSession ? `Connected ${sessionLabel}` : `Persona ${session.personaLabel}`) : 'API offline fallback'
      }
      currentPersona={persona}
      description="History mode gives a filterable event stream for telemetry, workspace activity, and AI proxy requests so teams can debug usage quickly."
      eyebrow="History"
      pathname="/app/history"
      showPersonaSwitcher={!isConnectedSession}
      title="Usage history and event timeline"
    >
      {session && workspaceId && history ? (
        <>
          <section className="metrics-grid">
            <article className="stat-card">
              <span className="micro-label">Workspace</span>
              <p className="stat-value">{history.workspace.name}</p>
              <p className="metric-copy">{history.workspace.role}</p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Events</span>
              <p className="stat-value">{visibleItems.length}</p>
              <p className="metric-copy">
                Page {effectivePage} | {pageSize} rows per page
              </p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Sources</span>
              <p className="stat-value">
                {telemetryCount}/{activityCount}/{aiCount}
              </p>
              <p className="metric-copy">telemetry/activity/ai</p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Last event</span>
              <p className="stat-value">{lastEventAt ? 'Recent' : 'None'}</p>
              <p className="metric-copy">{lastEventAt ? formatUtcDateTime(lastEventAt) : 'No events yet'}</p>
            </article>
          </section>

          <section className="panel">
            <span className="micro-label">Filters</span>
            <h2>Query history</h2>
            <form className="history-filter-form" method="get">
              {!isConnectedSession ? <input name="persona" type="hidden" value={persona} /> : null}
              <div className="history-filter-grid">
                <label className="history-filter-field">
                  <span>Workspace</span>
                  <select defaultValue={workspaceId} name="workspaceId">
                    {session.workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="history-filter-field">
                  <span>Source</span>
                  <select defaultValue={source} name="source">
                    <option value="all">all</option>
                    <option value="telemetry">telemetry</option>
                    <option value="activity">activity</option>
                    <option value="ai">ai</option>
                  </select>
                </label>
                <label className="history-filter-field">
                  <span>Limit</span>
                  <select defaultValue={String(pageSize)} name="limit">
                    {[10, 25, 50, 100, 200].map((candidateLimit) => (
                      <option key={candidateLimit} value={candidateLimit}>
                        {candidateLimit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="history-filter-field">
                  <span>Event type</span>
                  <input defaultValue={eventType ?? ''} name="eventType" placeholder="extension.quiz_answer_requested" type="text" />
                </label>
                <label className="history-filter-field">
                  <span>Installation</span>
                  <input
                    defaultValue={source === 'activity' ? '' : installationId ?? ''}
                    disabled={source === 'activity'}
                    name="installationId"
                    placeholder="inst_chrome_1"
                    type="text"
                  />
                </label>
                <label className="history-filter-field">
                  <span>Actor</span>
                  <input
                    defaultValue={source === 'telemetry' ? '' : actorId ?? ''}
                    disabled={source === 'telemetry'}
                    name="actorId"
                    placeholder="user_1"
                    type="text"
                  />
                </label>
              </div>
              <input name="page" type="hidden" value="1" />
              <div className="history-filter-actions">
                <button className="btn-primary" type="submit">
                  Apply filters
                </button>
                <Link className="btn-ghost" href={clearHref}>
                  Reset filters
                </Link>
                <a
                  className="btn-ghost"
                  download={`usage-history-${history.workspace.slug}-page-${effectivePage}.csv`}
                  href={canExportCsv ? csvHref : undefined}
                >
                  Export CSV
                </a>
                {!canExportCsv ? <span className="list-muted">CSV export requires `usage:export`.</span> : null}
              </div>
            </form>
          </section>

          <section className="panel">
            <span className="micro-label">Timeline</span>
            <h2>Telemetry, activity, and AI stream</h2>
            {visibleItems.length ? (
              <div className="history-event-list">
                {visibleItems.map((event) => (
                  <div className="list-item" key={event.id}>
                    <div className="billing-history-meta">
                      <span className="tag">{event.source}</span>
                      {event.severity ? (
                        <span className={event.severity === 'warn' || event.severity === 'error' ? 'tag warn' : 'tag'}>
                          {event.severity}
                        </span>
                      ) : null}
                      <span className="list-muted">{formatUtcDateTime(event.occurredAt)}</span>
                    </div>
                    <strong>{event.eventType}</strong>
                    <p>{event.summary}</p>
                    <span className="list-muted">
                      {event.installationId ? `installation ${event.installationId}` : 'no installation context'}
                      {event.actorId ? ` | actor ${event.actorId}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="micro-label">No matching events</span>
                <h2>Try broadening the filter scope.</h2>
                <p>
                  The selected workspace is active, but no telemetry, activity, or AI events match the current source and
                  filter set.
                </p>
              </div>
            )}
            <div className="history-filter-actions">
              <span className="list-muted">
                Loaded {history.items.length} rows
                {fetchLimit === maxHistoryFetchLimit ? ` (capped at ${maxHistoryFetchLimit})` : ''}
              </span>
              {hasPreviousPage ? (
                <Link className="btn-ghost" href={previousHref}>
                  Previous page
                </Link>
              ) : null}
              {hasNextPage ? (
                <Link className="btn-ghost" href={nextHref}>
                  Next page
                </Link>
              ) : null}
            </div>
            <div className="link-row">
              <Link className="btn-ghost" href="/app/usage">
                Open usage summary
              </Link>
              <Link className="btn-ghost" href="/app/installations">
                Open installations
              </Link>
              <Link className="btn-ghost" href="/app/billing">
                Open billing
              </Link>
            </div>
          </section>
        </>
      ) : session ? (
        <section className="empty-state">
          <span className="micro-label">History access</span>
          <h2>Usage history is unavailable for this workspace right now.</h2>
          <p>
            The session is active, but the history stream could not be loaded. This usually means the workspace has no
            accessible history rows yet or the API is still starting.
          </p>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in</span>
          <h2>Open a connected session to inspect usage history.</h2>
          <p>Telemetry and activity history require an authenticated dashboard session.</p>
        </section>
      )}
    </SiteShell>
  );
}
