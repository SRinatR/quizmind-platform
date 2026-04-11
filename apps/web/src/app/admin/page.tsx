import Link from 'next/link';
import { buildAccessContext } from '@quizmind/auth';

import { SiteShell } from '../../components/site-shell';
import { getVisibleAdminSections, buildVisibleAdminNavGroups } from '../../features/navigation/visibility';
import { getAccessTokenFromCookies } from '../../lib/auth-session';
import { isAdminSession } from '../../lib/admin-guard';
import {
  getAdminExtensionFleet,
  getAdminSecurity,
  getAdminUsers,
  getAdminWebhooks,
  getSession,
  getSupportImpersonationSessions,
  resolvePersona,
} from '../../lib/api';

interface AdminPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context) : [];
  const visibleNavGroups = context ? buildVisibleAdminNavGroups(context) : [];
  const isAdmin = session ? isAdminSession(session) : false;

  // Access guard
  if (!session || !isAdmin) {
    return (
      <SiteShell
        apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
        currentPersona={persona}
        description=""
        eyebrow="Admin"
        isAdmin={false}
        pathname="/admin"
        showPersonaSwitcher={false}
        title="Access restricted"
      >
        <section className="empty-state">
          <span className="micro-label">Access restricted</span>
          <h2>You don&apos;t have permission to view this area.</h2>
          <p>Admin access is required. If you believe this is a mistake, contact your platform administrator.</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <Link className="btn-primary" href="/app">Go to dashboard</Link>
            {!session ? <Link className="btn-ghost" href="/auth/login">Sign in</Link> : null}
          </div>
        </section>
      </SiteShell>
    );
  }

  const canViewFleet = visibleSections.some((s) => s.id === 'extension-fleet');
  const canViewWebhooks = visibleSections.some((s) => s.id === 'webhooks');
  const canViewSecurity = visibleSections.some((s) => s.id === 'security');
  const canViewUsers = visibleSections.some((s) => s.id === 'users');
  const canViewSupportSessions = visibleSections.some((s) => s.id === 'access-sessions');

  const [adminUsers, supportImpersonationSessions, adminExtensionFleet, adminWebhooks, adminSecurity] =
    await Promise.all([
      canViewUsers ? getAdminUsers(persona, accessToken) : Promise.resolve(null),
      canViewSupportSessions ? getSupportImpersonationSessions(persona, accessToken) : Promise.resolve(null),
      canViewFleet ? getAdminExtensionFleet(persona, {}, accessToken) : Promise.resolve(null),
      canViewWebhooks ? getAdminWebhooks(persona, {}, accessToken) : Promise.resolve(null),
      canViewSecurity ? getAdminSecurity(persona, {}, accessToken) : Promise.resolve(null),
    ]);

  const reconnectCount = adminExtensionFleet?.counts.reconnectRequired ?? 0;
  const failedWebhooks = adminWebhooks?.statusCounts.failed ?? 0;
  const securitySignals = adminSecurity?.findings.totalFailures ?? 0;
  const unboundQueues = adminWebhooks?.queues.filter((q) => q.processorState === 'declared_only') ?? [];
  const hasAlerts = reconnectCount > 0 || failedWebhooks > 0 || securitySignals > 0 || unboundQueues.length > 0;

  return (
    <SiteShell
      adminNavGroups={visibleNavGroups}
      apiState={`Connected \u2014 ${sessionLabel}`}
      currentPersona={persona}
      description=""
      eyebrow="Admin"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/admin"
      showPersonaSwitcher={false}
      title="Overview"
    >
      {visibleSections.length > 0 ? (
        <>
          {/* ── Alert strip — only shown when attention is needed ── */}
          {hasAlerts ? (
            <section
              className="panel"
              style={{ borderColor: 'rgba(184,92,56,0.35)', background: 'rgba(184,92,56,0.04)', padding: '12px 22px' }}
            >
              <span className="micro-label" style={{ color: '#8a3c19' }}>Attention required</span>
              <div className="tag-row" style={{ marginTop: '8px' }}>
                {reconnectCount > 0 ? (
                  <Link href="/admin/extension-fleet?installationConnection=reconnect_required" className="tag warn">
                    {reconnectCount} reconnect required
                  </Link>
                ) : null}
                {failedWebhooks > 0 ? (
                  <Link href="/admin/webhooks?webhookStatus=failed" className="tag warn">
                    {failedWebhooks} failed webhook{failedWebhooks !== 1 ? 's' : ''}
                  </Link>
                ) : null}
                {unboundQueues.length > 0 ? (
                  <Link href="/admin/webhooks" className="tag warn">
                    {unboundQueues.length} unbound queue processor{unboundQueues.length !== 1 ? 's' : ''}
                  </Link>
                ) : null}
                {securitySignals > 0 ? (
                  <Link href="/admin/security" className="tag warn">
                    {securitySignals} security signal{securitySignals !== 1 ? 's' : ''}
                  </Link>
                ) : null}
                {(adminSecurity?.findings.suspiciousAuthFailures ?? 0) > 0 ? (
                  <Link href="/admin/security?logStream=security&logSeverity=warn&logSearch=auth.login_failed" className="tag warn">
                    {adminSecurity!.findings.suspiciousAuthFailures} auth failure{adminSecurity!.findings.suspiciousAuthFailures !== 1 ? 's' : ''}
                  </Link>
                ) : null}
                {(adminSecurity?.findings.extensionReconnectOutstanding ?? 0) > 0 ? (
                  <Link href="/admin/security?logStream=security&logSearch=extension.installation_reconnect_requested" className="tag warn">
                    {adminSecurity!.findings.extensionReconnectOutstanding} unresolved reconnect{adminSecurity!.findings.extensionReconnectOutstanding !== 1 ? 's' : ''}
                  </Link>
                ) : null}
              </div>
            </section>
          ) : (
            <section
              className="panel"
              style={{ borderColor: 'rgba(34,120,74,0.25)', background: 'rgba(34,120,74,0.03)', padding: '10px 22px' }}
            >
              <span className="micro-label" style={{ color: '#1a5c38' }}>All clear</span>
              <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: 'var(--muted)' }}>
                No critical alerts at this time.
              </p>
            </section>
          )}

          {/* ── KPI metrics ── */}
          <section
            className="section-grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
          >
            {adminUsers?.accessDecision.allowed ? (
              <Link href="/admin/users" className="stat-card section-card--link" style={{ display: 'block' }}>
                <p className="stat-value">{adminUsers.items.length}</p>
                <p className="stat-label">Users</p>
              </Link>
            ) : null}

            {supportImpersonationSessions?.accessDecision.allowed ? (
              <Link href="/admin/access-sessions" className="stat-card section-card--link" style={{ display: 'block' }}>
                <p className="stat-value">{supportImpersonationSessions.items.length}</p>
                <p className="stat-label">Support sessions</p>
              </Link>
            ) : null}

            {adminExtensionFleet ? (
              <Link
                href="/admin/extension-fleet"
                className="stat-card section-card--link"
                style={{ display: 'block' }}
              >
                <p className="stat-value">{adminExtensionFleet.counts.total}</p>
                <p className="stat-label">
                  Installations
                  {reconnectCount > 0 ? (
                    <span className="tag warn" style={{ marginLeft: '6px' }}>{reconnectCount} reconnect</span>
                  ) : null}
                </p>
              </Link>
            ) : null}

            {adminWebhooks ? (
              <Link
                href={failedWebhooks > 0 ? '/admin/webhooks?webhookStatus=failed' : '/admin/webhooks'}
                className="stat-card section-card--link"
                style={{ display: 'block' }}
              >
                <p className="stat-value">{failedWebhooks}</p>
                <p className="stat-label">
                  Failed webhooks
                  {failedWebhooks > 0 ? (
                    <span className="tag warn" style={{ marginLeft: '6px' }}>!</span>
                  ) : null}
                </p>
              </Link>
            ) : null}

            {adminWebhooks && unboundQueues.length > 0 ? (
              <Link href="/admin/webhooks" className="stat-card section-card--link" style={{ display: 'block' }}>
                <p className="stat-value">{unboundQueues.length}</p>
                <p className="stat-label">
                  Unbound queue{unboundQueues.length !== 1 ? 's' : ''}
                  <span className="tag warn" style={{ marginLeft: '6px' }}>!</span>
                </p>
              </Link>
            ) : null}

            {adminSecurity ? (
              <Link href="/admin/security" className="stat-card section-card--link" style={{ display: 'block' }}>
                <p className="stat-value">{securitySignals}</p>
                <p className="stat-label">
                  Security signals
                  {securitySignals > 0 ? (
                    <span className="tag warn" style={{ marginLeft: '6px' }}>!</span>
                  ) : null}
                </p>
              </Link>
            ) : null}
          </section>

          {/* ── Recent activity ── */}
          <section className="split-grid">
            {/* Recent users */}
            {adminUsers?.accessDecision.allowed && adminUsers.items.length > 0 ? (
              <article className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="micro-label">People</span>
                  <Link href="/admin/users" className="btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                    All users
                  </Link>
                </div>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 600 }}>Recent accounts</h3>
                {adminUsers.items.slice(0, 6).map((user) => (
                  <div className="kv-row" key={user.id}>
                    <span className="kv-row__key">{user.displayName || 'Unnamed'}</span>
                    <span className="kv-row__value">{user.email}</span>
                  </div>
                ))}
              </article>
            ) : null}

            {/* Recent support access sessions */}
            {supportImpersonationSessions?.accessDecision.allowed ? (
              <article className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="micro-label">People</span>
                  <Link href="/admin/access-sessions" className="btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                    All sessions
                  </Link>
                </div>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 600 }}>Recent support access</h3>
                {supportImpersonationSessions.items.length > 0 ? (
                  <div className="event-list">
                    {supportImpersonationSessions.items.slice(0, 5).map((item) => (
                      <div className="event-row" key={item.impersonationSessionId}>
                        <span className="event-dot event-dot--warn" />
                        <div className="event-row__body">
                          <span className="event-row__type">
                            {item.supportActor.displayName || item.supportActor.email}
                            {' \u2192 '}
                            {item.targetUser.displayName || item.targetUser.email}
                          </span>
                          <p className="event-row__summary">{item.reason}</p>
                        </div>
                        <div className="event-row__meta">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="list-muted">No impersonation sessions yet.</p>
                )}
              </article>
            ) : null}

            {/* Security incident summary */}
            {adminSecurity && securitySignals > 0 ? (
              <article className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="micro-label">Operations</span>
                  <Link href="/admin/security" className="btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                    View security
                  </Link>
                </div>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 600 }}>Security incidents</h3>
                <div className="list-stack">
                  {adminSecurity.findings.suspiciousAuthFailures > 0 ? (
                    <div className="list-item">
                      <strong>Auth failures</strong>
                      <p>{adminSecurity.findings.suspiciousAuthFailures} suspicious login failure{adminSecurity.findings.suspiciousAuthFailures !== 1 ? 's' : ''}</p>
                    </div>
                  ) : null}
                  {adminSecurity.findings.extensionReconnectOutstanding > 0 ? (
                    <div className="list-item">
                      <strong>Unresolved reconnects</strong>
                      <p>{adminSecurity.findings.extensionReconnectOutstanding} installation{adminSecurity.findings.extensionReconnectOutstanding !== 1 ? 's' : ''} pending reconnect</p>
                    </div>
                  ) : null}
                  {adminSecurity.findings.extensionRuntimeErrors > 0 ? (
                    <div className="list-item">
                      <strong>Runtime errors</strong>
                      <p>{adminSecurity.findings.extensionRuntimeErrors} extension runtime error{adminSecurity.findings.extensionRuntimeErrors !== 1 ? 's' : ''}</p>
                    </div>
                  ) : null}
                  {adminSecurity.findings.extensionBootstrapRefreshFailures > 0 ? (
                    <div className="list-item">
                      <strong>Bootstrap failures</strong>
                      <p>{adminSecurity.findings.extensionBootstrapRefreshFailures} refresh failure{adminSecurity.findings.extensionBootstrapRefreshFailures !== 1 ? 's' : ''}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}

            {/* Job queue health — only shown when processors are unbound */}
            {adminWebhooks && unboundQueues.length > 0 ? (
              <article className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="micro-label">Operations</span>
                  <Link href="/admin/webhooks" className="btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                    View jobs
                  </Link>
                </div>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 600 }}>Job queue health</h3>
                <div className="list-stack">
                  {unboundQueues.map((q) => (
                    <div className="list-item" key={q.name}>
                      <strong>{q.name}</strong>
                      <p>{q.description} — no processor bound</p>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {/* Fleet health summary */}
            {adminExtensionFleet && (reconnectCount > 0 || adminExtensionFleet.counts.unsupported > 0) ? (
              <article className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="micro-label">Extensions</span>
                  <Link href="/admin/extension-fleet" className="btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                    View fleet
                  </Link>
                </div>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 600 }}>Fleet health</h3>
                <div className="list-stack">
                  {reconnectCount > 0 ? (
                    <div className="list-item">
                      <strong>Reconnect required</strong>
                      <p>{reconnectCount} installation{reconnectCount !== 1 ? 's' : ''} need reconnection</p>
                      <Link href="/admin/extension-fleet?installationConnection=reconnect_required" className="btn-ghost" style={{ fontSize: '0.78rem', marginTop: '4px', padding: '3px 8px' }}>
                        Filter fleet →
                      </Link>
                    </div>
                  ) : null}
                  {adminExtensionFleet.counts.unsupported > 0 ? (
                    <div className="list-item">
                      <strong>Unsupported versions</strong>
                      <p>{adminExtensionFleet.counts.unsupported} installation{adminExtensionFleet.counts.unsupported !== 1 ? 's' : ''} on unsupported extension version</p>
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}
          </section>

          {/* ── Section quick actions ── */}
          <section className="section-grid">
            {visibleSections.map((s) => (
              <Link key={s.id} href={s.href} className="section-card section-card--link">
                <span className="micro-label">{s.groupLabel}</span>
                <h3 style={{ margin: '4px 0 6px' }}>{s.title}</h3>
                <p style={{ fontSize: '0.83rem' }}>{s.description}</p>
              </Link>
            ))}
          </section>
        </>
      ) : (
        <section className="empty-state">
          <span className="micro-label">No access</span>
          <h2>No admin sections available for your account</h2>
          <p>Your account is authenticated but lacks the required admin permissions for any section.</p>
          <Link className="btn-ghost" href="/app">Go to dashboard</Link>
        </section>
      )}
    </SiteShell>
  );
}
