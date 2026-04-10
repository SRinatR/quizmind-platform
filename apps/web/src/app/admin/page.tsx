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

  const [adminUsers, supportImpersonationSessions, adminExtensionFleet, adminWebhooks, adminSecurity] =
    await Promise.all([
      getAdminUsers(persona, accessToken),
      getSupportImpersonationSessions(persona, accessToken),
      canViewFleet ? getAdminExtensionFleet(persona, {}, accessToken) : Promise.resolve(null),
      canViewWebhooks ? getAdminWebhooks(persona, {}, accessToken) : Promise.resolve(null),
      canViewSecurity ? getAdminSecurity(persona, {}, accessToken) : Promise.resolve(null),
    ]);

  const hasAlerts =
    (adminExtensionFleet?.counts.reconnectRequired ?? 0) > 0 ||
    (adminWebhooks?.statusCounts.failed ?? 0) > 0 ||
    (adminSecurity?.findings.totalFailures ?? 0) > 0;

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
          {/* ── Alert strip ── */}
          {hasAlerts ? (
            <section className="panel" style={{ borderColor: 'rgba(184,92,56,0.35)', background: 'rgba(184,92,56,0.04)' }}>
              <span className="micro-label" style={{ color: '#8a3c19' }}>Attention required</span>
              <div className="tag-row" style={{ marginTop: '8px' }}>
                {(adminExtensionFleet?.counts.reconnectRequired ?? 0) > 0 ? (
                  <Link href="/admin/extension-fleet?installationConnection=reconnect_required" className="tag warn">
                    {adminExtensionFleet!.counts.reconnectRequired} reconnect required
                  </Link>
                ) : null}
                {(adminWebhooks?.statusCounts.failed ?? 0) > 0 ? (
                  <Link href="/admin/webhooks?webhookStatus=failed" className="tag warn">
                    {adminWebhooks!.statusCounts.failed} failed webhook{adminWebhooks!.statusCounts.failed !== 1 ? 's' : ''}
                  </Link>
                ) : null}
                {(adminSecurity?.findings.totalFailures ?? 0) > 0 ? (
                  <Link href="/admin/security" className="tag warn">
                    {adminSecurity!.findings.totalFailures} security signal{adminSecurity!.findings.totalFailures !== 1 ? 's' : ''}
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* ── KPI metrics ── */}
          <section className="section-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
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
                href="/admin/extension-fleet?installationConnection=reconnect_required"
                className="stat-card section-card--link"
                style={{ display: 'block' }}
              >
                <p className={`stat-value${adminExtensionFleet.counts.reconnectRequired > 0 ? '' : ''}`}>
                  {adminExtensionFleet.counts.reconnectRequired}
                </p>
                <p className="stat-label">
                  Reconnect required
                  {adminExtensionFleet.counts.reconnectRequired > 0 ? (
                    <span className="tag warn" style={{ marginLeft: '6px' }}>!</span>
                  ) : null}
                </p>
              </Link>
            ) : null}

            {adminWebhooks ? (
              <Link
                href="/admin/webhooks?webhookStatus=failed"
                className="stat-card section-card--link"
                style={{ display: 'block' }}
              >
                <p className="stat-value">{adminWebhooks.statusCounts.failed}</p>
                <p className="stat-label">
                  Failed webhooks
                  {adminWebhooks.statusCounts.failed > 0 ? (
                    <span className="tag warn" style={{ marginLeft: '6px' }}>!</span>
                  ) : null}
                </p>
              </Link>
            ) : null}

            {adminSecurity ? (
              <Link href="/admin/security" className="stat-card section-card--link" style={{ display: 'block' }}>
                <p className="stat-value">{adminSecurity.findings.totalFailures}</p>
                <p className="stat-label">
                  Security signals
                  {adminSecurity.findings.totalFailures > 0 ? (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="micro-label">People</span>
                  <Link href="/admin/users" className="btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>All users</Link>
                </div>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 600 }}>Recent accounts</h3>
                {adminUsers.items.slice(0, 6).map((user) => (
                  <div className="kv-row" key={user.id}>
                    <span className="kv-row__key">{user.displayName || 'Unnamed'}</span>
                    <span className="kv-row__value">{user.email}</span>
                  </div>
                ))}
              </article>
            ) : null}

            {/* Recent support sessions */}
            {supportImpersonationSessions?.accessDecision.allowed ? (
              <article className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="micro-label">People</span>
                  <Link href="/admin/access-sessions" className="btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>All sessions</Link>
                </div>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 600 }}>Recent support access</h3>
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
          </section>

          {/* ── Quick actions ── */}
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
