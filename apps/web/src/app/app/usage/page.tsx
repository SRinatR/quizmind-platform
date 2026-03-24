import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, getUsageSummary, resolvePersona } from '../../../lib/api';

interface UsagePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Unavailable';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatWindow(start?: string, end?: string) {
  if (!start || !end) {
    return 'Current window unavailable';
  }

  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
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
  const usage = workspaceId ? await getUsageSummary(persona, workspaceId, accessToken) : null;
  const highlightedQuota = usage?.quotas[0] ?? null;

  return (
    <SiteShell
      apiState={
        session ? (isConnectedSession ? `Connected ${sessionLabel}` : `Persona ${session.personaLabel}`) : 'API offline fallback'
      }
      currentPersona={persona}
      description="Quota counters, extension activity, and installation health now come from a dedicated usage snapshot instead of a placeholder route."
      eyebrow="Usage"
      pathname="/app/usage"
      showPersonaSwitcher={!isConnectedSession}
      title="Workspace usage and telemetry"
    >
      {session && workspaceId && usage ? (
        <>
          <section className="metrics-grid">
            <article className="stat-card">
              <span className="micro-label">Plan</span>
              <p className="stat-value">{usage.planCode}</p>
              <p className="metric-copy">{usage.subscriptionStatus} subscription state</p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Installations</span>
              <p className="stat-value">{usage.installations.length}</p>
              <p className="metric-copy">{usage.workspace.name}</p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Primary quota</span>
              <p className="stat-value">
                {highlightedQuota ? `${highlightedQuota.consumed}${highlightedQuota.limit ? `/${highlightedQuota.limit}` : ''}` : '-'}
              </p>
              <p className="metric-copy">{highlightedQuota?.label ?? 'No tracked quota available yet.'}</p>
            </article>
            <article className="stat-card">
              <span className="micro-label">Recent events</span>
              <p className="stat-value">{usage.recentEvents.length}</p>
              <p className="metric-copy">{formatWindow(usage.currentPeriodStart, usage.currentPeriodEnd)}</p>
            </article>
          </section>

          <section className="split-grid">
            <article className="panel">
              <span className="micro-label">Quotas</span>
              <h2>Current consumption window</h2>
              <div className="list-stack">
                {usage.quotas.map((quota) => (
                  <div className="list-item" key={quota.key}>
                    <strong>{quota.label}</strong>
                    <p>
                      {quota.consumed}
                      {typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''} | {quota.status}
                    </p>
                    <span className="list-muted">{formatWindow(quota.periodStart, quota.periodEnd)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <span className="micro-label">Installations</span>
              <h2>Extension fleet</h2>
              <div className="list-stack">
                {usage.installations.map((installation) => (
                  <div className="list-item" key={installation.installationId}>
                    <strong>{installation.installationId}</strong>
                    <p>
                      {installation.browser} | v{installation.extensionVersion} | schema {installation.schemaVersion}
                    </p>
                    <span className="list-muted">
                      {installation.capabilities.join(', ') || 'No capabilities reported'} | last seen{' '}
                      {formatDateTime(installation.lastSeenAt)}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel">
            <span className="micro-label">Activity</span>
            <h2>Recent telemetry and dashboard activity</h2>
            <div className="list-stack">
              {usage.recentEvents.map((event) => (
                <div className="list-item" key={event.id}>
                  <strong>{event.eventType}</strong>
                  <p>{event.summary}</p>
                  <span className="list-muted">
                    {event.source}
                    {event.installationId ? ` | ${event.installationId}` : ''}
                    {event.actorId ? ` | actor ${event.actorId}` : ''}
                    {event.severity ? ` | ${event.severity}` : ''} | {formatDateTime(event.occurredAt)}
                  </span>
                </div>
              ))}
            </div>
            <div className="link-row">
              <Link className="btn-ghost" href="/app">
                Back to overview
              </Link>
              <Link className="btn-ghost" href="/app/billing">
                Open billing
              </Link>
              <Link className="btn-ghost" href="/app/settings">
                Open settings
              </Link>
            </div>
          </section>
        </>
      ) : session ? (
        <section className="empty-state">
          <span className="micro-label">Usage access</span>
          <h2>Usage data is not available for this workspace yet.</h2>
          <p>
            The session is active, but quota counters or telemetry could not be hydrated from the API. This usually
            means the workspace has no usage snapshot yet or the API is still starting.
          </p>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in</span>
          <h2>Open a connected session to inspect live usage.</h2>
          <p>Usage analytics and telemetry require an authenticated dashboard session.</p>
        </section>
      )}
    </SiteShell>
  );
}
