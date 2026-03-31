import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, getUsageSummary, resolvePersona } from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';

interface UsagePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatWindow(start?: string, end?: string) {
  if (!start || !end) return 'Window unavailable';
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

function quotaTone(pct: number): 'ok' | 'warn' | 'critical' {
  if (pct >= 90) return 'critical';
  if (pct >= 70) return 'warn';
  return 'ok';
}

function eventDotClass(source: string): string {
  if (source === 'ai') return 'event-dot event-dot--ai';
  if (source === 'activity') return 'event-dot event-dot--activity';
  return 'event-dot event-dot--info';
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const requestedWorkspaceId = readSearchParam(resolvedSearchParams?.workspaceId);
  const workspaceId =
    requestedWorkspaceId && session?.workspaces.some((w) => w.id === requestedWorkspaceId)
      ? requestedWorkspaceId
      : session?.workspaces[0]?.id;
  const usage = workspaceId ? await getUsageSummary(persona, workspaceId, accessToken) : null;
  const highlightedQuota = usage?.quotas[0] ?? null;
  const isAdmin = session ? isAdminSession(session) : false;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Usage"
      isAdmin={isAdmin}
      pathname="/app/usage"
      showPersonaSwitcher={false}
      title="Workspace usage"
    >
      {session && workspaceId && usage ? (
        <>
          {/* ── Metrics ── */}
          <section className="metrics-grid">
            <article className="stat-card">
              <span className="micro-label">Workspace</span>
              <p className="stat-value">{usage.workspace.name}</p>
              <p className="metric-copy">Usage period active</p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Installations</span>
              <p className="stat-value">{usage.installations.length}</p>
              <p className="metric-copy">{usage.workspace.name}</p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Primary quota</span>
              <p className="stat-value">
                {highlightedQuota
                  ? `${highlightedQuota.consumed}${highlightedQuota.limit ? `/${highlightedQuota.limit}` : ''}`
                  : '—'}
              </p>
              <p className="metric-copy">{highlightedQuota?.label ?? 'No quota tracked yet'}</p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Recent events</span>
              <p className="stat-value">{usage.recentEvents.length}</p>
              <p className="metric-copy">{formatWindow(usage.currentPeriodStart, usage.currentPeriodEnd)}</p>
            </article>
          </section>

          {/* ── Quotas + Fleet ── */}
          <section className="split-grid">
            <article className="panel">
              <span className="micro-label">Quotas</span>
              <h2>Consumption window</h2>
              {usage.quotas.length > 0 ? (
                <div className="list-stack">
                  {usage.quotas.map((quota) => {
                    const pct =
                      quota.limit && quota.limit > 0
                        ? Math.min(100, Math.round((quota.consumed / quota.limit) * 100))
                        : -1;
                    const tone = pct >= 0 ? quotaTone(pct) : 'unknown';
                    return (
                      <div className="quota-row" key={quota.key}>
                        <div className="quota-row__header">
                          <span className="quota-row__label">{quota.label}</span>
                          <span className="quota-row__value">
                            {quota.consumed}
                            {typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''}
                            {pct >= 0 ? ` · ${pct}%` : ''}
                          </span>
                        </div>
                        <div className="quota-bar">
                          <div
                            className={`quota-bar__fill quota-bar__fill--${tone}`}
                            style={{ width: pct >= 0 ? `${pct}%` : '0%' }}
                          />
                        </div>
                        <span className="quota-row__period">
                          {formatWindow(quota.periodStart, quota.periodEnd)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <p>No quota data available for this period.</p>
                </div>
              )}
            </article>

            <article className="panel">
              <span className="micro-label">Installations</span>
              <h2>Extension fleet</h2>
              {usage.installations.length > 0 ? (
                <div className="installation-list">
                  {usage.installations.map((inst) => (
                    <div className="installation-row" key={inst.installationId}>
                      <div className="installation-row__header">
                        <span className="installation-row__id">{inst.installationId}</span>
                        <div className="installation-row__badges">
                          <span className="tag-soft">{inst.browser}</span>
                          <span className="tag-soft tag-soft--gray">v{inst.extensionVersion}</span>
                        </div>
                      </div>
                      {inst.capabilities.length > 0 ? (
                        <div className="tag-row">
                          {inst.capabilities.map((cap) => (
                            <span className="tag" key={cap}>{cap}</span>
                          ))}
                        </div>
                      ) : null}
                      <span className="installation-row__detail">
                        Schema {inst.schemaVersion} · Last seen {formatDateTime(inst.lastSeenAt)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>No extension installations yet.</p>
                  <Link className="btn-ghost" href="/app/extension/connect">Connect extension</Link>
                </div>
              )}
            </article>
          </section>

          {/* ── Activity ── */}
          <article className="panel">
            <span className="micro-label">Activity</span>
            <h2>Recent telemetry and events</h2>
            {usage.recentEvents.length > 0 ? (
              <div className="event-list">
                {usage.recentEvents.map((event) => (
                  <div className="event-row" key={event.id}>
                    <span className={eventDotClass(event.source)} />
                    <div className="event-row__body">
                      <span className="event-row__type">{event.eventType}</span>
                      {event.summary ? <p className="event-row__summary">{event.summary}</p> : null}
                    </div>
                    <span className="event-row__meta">
                      {formatDateTime(event.occurredAt)}
                      {event.severity ? <><br />{event.severity}</> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No events recorded in this period yet.</p>
              </div>
            )}
            <div className="link-row">
              <Link className="btn-ghost" href="/app/history">Full history</Link>
              <Link className="btn-ghost" href="/app/installations">Installations</Link>
            </div>
          </article>
        </>
      ) : session && workspaceId ? (
        <section className="empty-state">
          <span className="micro-label">No data</span>
          <h2>Usage data not available yet</h2>
          <p>
            The workspace is active but has no usage snapshot yet. Data appears here as the extension is used.
          </p>
        </section>
      ) : session ? (
        <section className="empty-state">
          <span className="micro-label">No workspace</span>
          <h2>No workspace linked to your account yet.</h2>
          <p>
            Your session is active but your account is not yet linked to a workspace.
            Contact your administrator to get access.
          </p>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in required</span>
          <h2>Sign in to view usage</h2>
          <p>Usage analytics and telemetry require an authenticated session.</p>
          <Link className="btn-primary" href="/auth/login">Sign in</Link>
        </section>
      )}
    </SiteShell>
  );
}
