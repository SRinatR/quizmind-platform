import { redirect } from 'next/navigation';
import { buildAccessContext } from '@quizmind/auth';
import {
  type AdminExtensionFleetFilters,
  type AdminLogFilters,
  type AdminWebhookFilters,
  type ExtensionBootstrapRequest,
} from '@quizmind/contracts';
import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { buildAdminSectionHref } from '../../../features/admin/admin-section-href';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { isAdminSession } from '../../../lib/admin-guard';
import {
  getAdminExtensionFleet,
  getAdminProviderGovernance,
  getAdminLogs,
  getAdminSecurity,
  getAdminWebhooks,
  getAdminUsers,
  getCompatibilityRules,
  getFeatureFlags,
  getRemoteConfigState,
  getSession,
  getUsageSummary,
  resolvePersona,
  simulateExtensionBootstrap,
} from '../../../lib/api';
import { getVisibleAdminSections, buildVisibleAdminNavGroups } from '../../../features/navigation/visibility';
import { type AdminSection } from '../../../features/admin/sections';
import { ExtensionControlClient } from './extension-control-client';
import { FeatureFlagsClient } from './feature-flags-client';
import { CompatibilityClient } from './compatibility-client';
import { AdminAiProvidersClient } from './admin-ai-providers-client';
import { RemoteConfigClient } from './remote-config-client';
import { UsersDirectoryClient } from './users-directory-client';
import { UsageExplorerClient } from './usage-explorer-client';
import { LogsExplorerClient } from './logs-explorer-client';
import { WebhooksClient } from './webhooks-client';
import { ExtensionFleetClient } from './extension-fleet-client';

// ── Route aliases: old flat routes → new canonical routes ───────────────────
const ROUTE_REDIRECTS: Record<string, string> = {
  logs: 'events',
  'extension-control': 'bootstrap-simulator',
  'ai-providers': 'ai-routing',
  support: 'users',
  'access-sessions': 'users',
};

interface AdminSectionPageProps {
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];
  return Array.isArray(value) ? (value[0] ?? undefined) : (value ?? undefined);
}

function readIntegerSearchParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): number | undefined {
  const rawValue = readSearchParam(searchParams, key);
  if (!rawValue) return undefined;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatTrendBucketLabel(bucketStart: string): string {
  const timestamp = Date.parse(bucketStart);
  if (!Number.isFinite(timestamp)) return bucketStart;
  return `${bucketStart.slice(5, 16).replace('T', ' ')} UTC`;
}

function createInitialExtensionBootstrapRequest(userId: string): ExtensionBootstrapRequest {
  return {
    installationId: 'sim-local-browser',
    userId,
    environment: 'development',
    handshake: {
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilities: ['quiz-capture', 'history-sync', 'remote-sync'],
      browser: 'chrome',
    },
  };
}

/** Compact page header with group context and KPI chips. */
function SectionHeader({
  groupLabel,
  title,
  tags,
}: {
  groupLabel: string;
  title: string;
  tags: Array<{ label: string; warn?: boolean }>;
}) {
  return (
    <section
      className="panel"
      style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}
    >
      <div>
        <span className="micro-label">{groupLabel}</span>
        <h2 style={{ margin: '2px 0 0', fontSize: '1.1rem' }}>{title}</h2>
      </div>
      {tags.length > 0 ? (
        <div className="tag-row" style={{ margin: 0 }}>
          {tags.map((t) => (
            <span key={t.label} className={t.warn ? 'tag warn' : 'tag'}>
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Cross-links to sibling sections in the same group — builds toolkit cohesion. */
function SectionGroupLinks({
  current,
  visibleSections,
}: {
  current: AdminSection;
  visibleSections: AdminSection[];
}) {
  const peers = visibleSections.filter(
    (s) => s.group === current.group && s.id !== current.id,
  );
  if (peers.length === 0) return null;
  return (
    <div
      className="tag-row"
      style={{ margin: 0, padding: '0 0 4px' }}
    >
      <span style={{ fontSize: '0.74rem', color: 'var(--muted)', paddingRight: '4px', fontWeight: 500 }}>
        {current.groupLabel}:
      </span>
      {peers.map((peer) => (
        <Link
          key={peer.id}
          href={peer.href}
          className="btn-ghost"
          style={{ fontSize: '0.78rem', padding: '3px 10px' }}
        >
          {peer.navLabel}
        </Link>
      ))}
    </div>
  );
}

export default async function AdminSectionPage({ params, searchParams }: AdminSectionPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  // Redirect legacy flat routes to new canonical routes (preserves all query params including persona)
  const redirectTarget = ROUTE_REDIRECTS[resolvedParams.section];
  if (redirectTarget) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(resolvedSearchParams ?? {})) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val) query.set(k, val);
    }
    const qs = query.toString();
    redirect(`/admin/${redirectTarget}${qs ? `?${qs}` : ''}`);
  }

  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const isAdmin = session ? isAdminSession(session) : false;

  // Block non-admin access early
  if (!session || !isAdmin) {
    const sessionLabel = session?.user.displayName || session?.user.email;
    return (
      <SiteShell
        apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
        currentPersona={persona}
        description=""
        eyebrow="Admin"
        isAdmin={false}
        pathname={`/admin/${resolvedParams.section}`}
        showPersonaSwitcher={false}
        title="Access restricted"
      >
        <section className="empty-state">
          <span className="micro-label">Access restricted</span>
          <h2>You don&apos;t have permission to view this area.</h2>
          <p>Admin access is required. If you believe this is a mistake, contact your platform administrator.</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <a className="btn-primary" href="/app">Go to dashboard</a>
            {!session ? <a className="btn-ghost" href="/auth/login">Sign in</a> : null}
          </div>
        </section>
      </SiteShell>
    );
  }

  const sec = resolvedParams.section;
  const isSecurityRoute = sec === 'security';

  // ── Section-specific filter objects (no workspaceId — platform-scoped) ──────
  const requestedLogStream = readSearchParam(resolvedSearchParams, 'logStream') as AdminLogFilters['stream'] | undefined;
  const adminLogFilters: Partial<AdminLogFilters> = {
    stream: requestedLogStream ?? (isSecurityRoute ? 'security' : undefined),
    severity: readSearchParam(resolvedSearchParams, 'logSeverity') as AdminLogFilters['severity'] | undefined,
    search: readSearchParam(resolvedSearchParams, 'logSearch'),
    limit: readIntegerSearchParam(resolvedSearchParams, 'logLimit'),
  };

  const adminWebhookFilters: Partial<AdminWebhookFilters> = {
    provider: readSearchParam(resolvedSearchParams, 'webhookProvider') as AdminWebhookFilters['provider'] | undefined,
    status: readSearchParam(resolvedSearchParams, 'webhookStatus') as AdminWebhookFilters['status'] | undefined,
    search: readSearchParam(resolvedSearchParams, 'webhookSearch'),
    limit: readIntegerSearchParam(resolvedSearchParams, 'webhookLimit'),
  };

  const extensionFleetFilters: Partial<AdminExtensionFleetFilters> = {
    installationId: readSearchParam(resolvedSearchParams, 'fleetInstallationId'),
    compatibility: readSearchParam(resolvedSearchParams, 'installationCompatibility') as AdminExtensionFleetFilters['compatibility'] | undefined,
    connection: readSearchParam(resolvedSearchParams, 'installationConnection') as AdminExtensionFleetFilters['connection'] | undefined,
    search: readSearchParam(resolvedSearchParams, 'installationSearch'),
    limit: readIntegerSearchParam(resolvedSearchParams, 'installationLimit'),
  };

  const extensionBootstrapRequest = session
    ? createInitialExtensionBootstrapRequest(session.user.id)
    : null;

  // ── Section-targeted data fetching ───────────────────────────────────────────
  // Registry maps each section slug to the loaders it requires. Any section not
  // listed gets an empty needs object (no fetches, shows fallback UI).
  interface LoaderNeeds {
    users?: true;
    fleet?: true;
    logs?: true;
    security?: true;
    webhooks?: true;
    usage?: true;
    compatibility?: true;
    flags?: true;
    remoteConfig?: true;
    aiRouting?: true;
  }
  const SECTION_NEEDS: Record<string, LoaderNeeds> = {
    users:                  { users: true },
    events:                 { logs: true },
    security:               { security: true },
    webhooks:               { webhooks: true },
    usage:                  { usage: true },
    'extension-fleet':      { fleet: true },
    compatibility:          { compatibility: true },
    'bootstrap-simulator':  { usage: true },
    'feature-flags':        { flags: true },
    'remote-config':        { remoteConfig: true },
    'ai-routing':           { aiRouting: true },
  };
  const needs: LoaderNeeds = SECTION_NEEDS[sec] ?? {};

  const userFilters = needs.users
    ? {
        query: readSearchParam(resolvedSearchParams, 'userQuery'),
        role: readSearchParam(resolvedSearchParams, 'userRole'),
        banned: readSearchParam(resolvedSearchParams, 'userBanned'),
        verified: readSearchParam(resolvedSearchParams, 'userVerified'),
        sort: readSearchParam(resolvedSearchParams, 'userSort'),
        page: readIntegerSearchParam(resolvedSearchParams, 'userPage'),
        limit: readIntegerSearchParam(resolvedSearchParams, 'userLimit'),
      }
    : undefined;

  const [
    featureFlags,
    adminProviderGovernance,
    compatibilityRules,
    adminUsers,
    remoteConfigState,
    usageSummary,
    adminExtensionFleet,
    adminLogs,
    adminSecurity,
    adminWebhooks,
  ] = await Promise.all([
    needs.flags ? getFeatureFlags(persona, accessToken) : Promise.resolve(null),
    needs.aiRouting ? getAdminProviderGovernance(accessToken) : Promise.resolve(null),
    needs.compatibility ? getCompatibilityRules(persona, accessToken) : Promise.resolve(null),
    needs.users ? getAdminUsers(persona, accessToken, userFilters) : Promise.resolve(null),
    needs.remoteConfig ? getRemoteConfigState(persona, undefined, accessToken) : Promise.resolve(null),
    needs.usage ? getUsageSummary(persona, accessToken) : Promise.resolve(null),
    needs.fleet ? getAdminExtensionFleet(persona, extensionFleetFilters, accessToken) : Promise.resolve(null),
    needs.logs ? getAdminLogs(persona, adminLogFilters, accessToken) : Promise.resolve(null),
    needs.security ? getAdminSecurity(persona, adminLogFilters, accessToken) : Promise.resolve(null),
    needs.webhooks ? getAdminWebhooks(persona, adminWebhookFilters, accessToken) : Promise.resolve(null),
  ]);

  const extensionBootstrap =
    sec === 'bootstrap-simulator' && extensionBootstrapRequest
      ? await simulateExtensionBootstrap(extensionBootstrapRequest, accessToken)
      : null;

  const isConnectedSession = session?.personaKey === 'connected-user';
  const canEditFeatureFlags = Boolean(isConnectedSession && featureFlags?.writeDecision.allowed);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const canManageUserAccess = Boolean(isConnectedSession && adminUsers?.writeDecision.allowed);
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context) : [];
  const visibleNavGroups = context ? buildVisibleAdminNavGroups(context) : [];
  const section = visibleSections.find((item) => item.href.endsWith(`/${sec}`));
  const previewRoles = session ? [...session.principal.systemRoles] : [];

  return (
    <SiteShell
      adminNavGroups={visibleNavGroups}
      apiState={`Connected \u2014 ${sessionLabel}`}
      currentPersona={persona}
      description=""
      eyebrow="Admin"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname={`/admin/${sec}`}
      showPersonaSwitcher={false}
      title={section?.title ?? sec}
    >
      {section && session ? (
        // ── People: Users ─────────────────────────────────────────────────
        section.id === 'users' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminUsers?.total ?? 0} user${(adminUsers?.total ?? 0) !== 1 ? 's' : ''}` },
                { label: canManageUserAccess ? 'write access' : 'read-only', warn: !canManageUserAccess },
              ]}
            />
            {adminUsers ? (
              <UsersDirectoryClient
                canManageUserAccess={canManageUserAccess}
                currentUserId={session.user.id}
                isConnectedSession={isConnectedSession}
                items={adminUsers.items}
                total={adminUsers.total}
                page={adminUsers.page}
                limit={adminUsers.limit}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Users</span>
                <h2>User directory unavailable.</h2>
                <p>The API did not return a user directory snapshot for this environment.</p>
              </section>
            )}
          </>
        ) : // ── Operations: Events ────────────────────────────────────────
        section.id === 'events' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminLogs?.items.length ?? 0} event${(adminLogs?.items.length ?? 0) !== 1 ? 's' : ''}` },
                { label: `stream: ${adminLogs?.filters.stream ?? 'all'}` },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {adminLogs ? (
              <LogsExplorerClient
                canExportLogs={adminLogs.exportDecision.allowed}
                defaultStreamOnReset="all"
                isConnectedSession={isConnectedSession}
                snapshot={adminLogs}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Events</span>
                <h2>Event stream unavailable.</h2>
                <p>The API did not return an audit log snapshot for this context.</p>
              </section>
            )}
          </>
        ) : // ── Operations: Security ──────────────────────────────────────
        section.id === 'security' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminSecurity?.items.length ?? 0} event${(adminSecurity?.items.length ?? 0) !== 1 ? 's' : ''}` },
                { label: `${adminSecurity?.findings.totalFailures ?? 0} flagged`, warn: (adminSecurity?.findings.totalFailures ?? 0) > 0 },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {adminSecurity ? (
              <>
                <section className="panel">
                  <span className="micro-label">Findings</span>
                  <h3 style={{ margin: '4px 0 12px' }}>Detection summary</h3>
                  <div className="tag-row">
                    <span className={adminSecurity.findings.suspiciousAuthFailures > 0 ? 'tag warn' : 'tag'}>
                      auth failures {adminSecurity.findings.suspiciousAuthFailures}
                    </span>
                    <span className="tag">impersonation {adminSecurity.findings.impersonationEvents}</span>
                    <span className="tag">provider credentials {adminSecurity.findings.providerCredentialEvents}</span>
                    <span className="tag">privileged actions {adminSecurity.findings.privilegedActionEvents}</span>
                    <span className={adminSecurity.findings.extensionBootstrapRefreshFailures > 0 ? 'tag warn' : 'tag'}>
                      bootstrap failures {adminSecurity.findings.extensionBootstrapRefreshFailures}
                    </span>
                    <span className="tag">reconnect requests {adminSecurity.findings.extensionReconnectRequests}</span>
                    <span className="tag">reconnected {adminSecurity.findings.extensionReconnectRecoveries}</span>
                    <span className={adminSecurity.findings.extensionReconnectOutstanding > 0 ? 'tag warn' : 'tag'}>
                      unresolved reconnects {adminSecurity.findings.extensionReconnectOutstanding}
                    </span>
                    <span className="tag">session revocations {adminSecurity.findings.extensionSessionRevocations}</span>
                    <span className="tag">session rotations {adminSecurity.findings.extensionSessionRotations}</span>
                    <span className={adminSecurity.findings.extensionRuntimeErrors > 0 ? 'tag warn' : 'tag'}>
                      runtime errors {adminSecurity.findings.extensionRuntimeErrors}
                    </span>
                  </div>
                  <div className="tag-row" style={{ marginTop: '12px' }}>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({ section: sec, currentSearchParams: resolvedSearchParams, overrides: { logStream: 'security', logSeverity: 'warn', logSearch: 'auth.login_failed' } })}
                    >
                      auth failures ({adminSecurity.findings.suspiciousAuthFailures})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({ section: sec, currentSearchParams: resolvedSearchParams, overrides: { logStream: 'security', logSeverity: 'warn', logSearch: 'extension.bootstrap_refresh_failed' } })}
                    >
                      bootstrap failures ({adminSecurity.findings.extensionBootstrapRefreshFailures})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({ section: sec, currentSearchParams: resolvedSearchParams, overrides: { logStream: 'security', logSeverity: 'all', logSearch: 'extension.installation_reconnect_requested' } })}
                    >
                      reconnect requests ({adminSecurity.findings.extensionReconnectRequests})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({ section: sec, currentSearchParams: resolvedSearchParams, overrides: { logStream: 'security', logSeverity: 'all', logSearch: 'extension.installation_session_revoked' } })}
                    >
                      session revocations ({adminSecurity.findings.extensionSessionRevocations})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({ section: sec, currentSearchParams: resolvedSearchParams, overrides: { logStream: 'security', logSeverity: 'warn', logSearch: 'extension.runtime_error' } })}
                    >
                      runtime errors ({adminSecurity.findings.extensionRuntimeErrors})
                    </Link>
                  </div>
                </section>
                <section className="panel">
                  <span className="micro-label">Trend</span>
                  <h3 style={{ margin: '4px 0 12px' }}>
                    Extension lifecycle ({adminSecurity.lifecycleTrend.windowHours}h window, {adminSecurity.lifecycleTrend.bucketHours}h buckets)
                  </h3>
                  <div className="list-stack">
                    {adminSecurity.lifecycleTrend.buckets.map((bucket) => (
                      <div className="list-item" key={bucket.bucketStart}>
                        <strong>{formatTrendBucketLabel(bucket.bucketStart)}</strong>
                        <p>
                          failures {bucket.extensionBootstrapRefreshFailures + bucket.extensionRuntimeErrors},{' '}
                          reconnects {bucket.extensionReconnectRequests},{' '}
                          recovered {bucket.extensionReconnectRecoveries},{' '}
                          revocations {bucket.extensionSessionRevocations},{' '}
                          rotations {bucket.extensionSessionRotations}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <span className="micro-label">Controls</span>
                  <h3 style={{ margin: '4px 0 12px' }}>Security hardening checkpoints</h3>
                  <div className="list-stack">
                    {adminSecurity.controls.map((control) => (
                      <div className="list-item" key={control.id}>
                        <strong>{control.title}</strong>
                        <p>{control.description}</p>
                        <span className={control.status === 'enabled' ? 'tag' : 'tag warn'}>
                          {control.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
                <LogsExplorerClient
                  canExportLogs={adminSecurity.exportDecision.allowed}
                  defaultStreamOnReset="security"
                  isConnectedSession={isConnectedSession}
                  snapshot={adminSecurity}
                />
              </>
            ) : (
              <section className="empty-state">
                <span className="micro-label">Security</span>
                <h2>Security data unavailable.</h2>
                <p>The API did not return a security log snapshot for this context.</p>
              </section>
            )}
          </>
        ) : // ── Operations: Jobs & Webhooks ───────────────────────────────
        section.id === 'webhooks' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminWebhooks?.items.length ?? 0} deliver${(adminWebhooks?.items.length ?? 0) !== 1 ? 'ies' : 'y'}` },
                { label: `${adminWebhooks?.statusCounts.failed ?? 0} failed`, warn: (adminWebhooks?.statusCounts.failed ?? 0) > 0 },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {adminWebhooks ? (
              <WebhooksClient isConnectedSession={isConnectedSession} snapshot={adminWebhooks} />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Jobs & Webhooks</span>
                <h2>Webhook data unavailable.</h2>
                <p>The API did not return webhook delivery data for this environment.</p>
              </section>
            )}
          </>
        ) : // ── Extensions: Fleet ─────────────────────────────────────────
        section.id === 'extension-fleet' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminExtensionFleet?.counts.total ?? 0} installation${(adminExtensionFleet?.counts.total ?? 0) !== 1 ? 's' : ''}` },
                { label: `${adminExtensionFleet?.counts.reconnectRequired ?? 0} reconnect required`, warn: (adminExtensionFleet?.counts.reconnectRequired ?? 0) > 0 },
                { label: `${adminExtensionFleet?.counts.unsupported ?? 0} unsupported`, warn: (adminExtensionFleet?.counts.unsupported ?? 0) > 0 },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {adminExtensionFleet ? (
              <ExtensionFleetClient snapshot={adminExtensionFleet} />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Fleet</span>
                <h2>Fleet data unavailable.</h2>
                <p>The API did not return a fleet snapshot for this context.</p>
              </section>
            )}
          </>
        ) : // ── Extensions: Usage ─────────────────────────────────────────
        section.id === 'usage' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${usageSummary?.quotas.length ?? 0} quota${(usageSummary?.quotas.length ?? 0) !== 1 ? 's' : ''}` },
                { label: `${usageSummary?.installations.length ?? 0} installation${(usageSummary?.installations.length ?? 0) !== 1 ? 's' : ''}` },
                { label: usageSummary?.exportDecision.allowed ? 'export access' : 'read-only', warn: !usageSummary?.exportDecision.allowed },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {usageSummary ? (
              <UsageExplorerClient
                canExportUsage={usageSummary.exportDecision.allowed}
                isConnectedSession={isConnectedSession}
                usageSummary={usageSummary}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Usage</span>
                <h2>Usage data unavailable.</h2>
                <p>The API did not return a usage snapshot for this context.</p>
              </section>
            )}
          </>
        ) : // ── Extensions: Compatibility ──────────────────────────────────
        section.id === 'compatibility' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${compatibilityRules?.items.length ?? 0} rule${(compatibilityRules?.items.length ?? 0) !== 1 ? 's' : ''}` },
                { label: compatibilityRules?.publishDecision.allowed ? 'publish access' : 'publish blocked', warn: !compatibilityRules?.publishDecision.allowed },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {compatibilityRules ? (
              <CompatibilityClient initialState={compatibilityRules} isConnectedSession={isConnectedSession} />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Compatibility</span>
                <h2>Compatibility data unavailable.</h2>
                <p>The API did not return a compatibility rule snapshot for this environment.</p>
              </section>
            )}
          </>
        ) : // ── Extensions: Bootstrap Simulator ───────────────────────────
        section.id === 'bootstrap-simulator' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${extensionBootstrap?.featureFlags.length ?? 0} flag${(extensionBootstrap?.featureFlags.length ?? 0) !== 1 ? 's' : ''} resolved` },
                { label: `${extensionBootstrap?.remoteConfig.appliedLayerIds.length ?? 0} layer${(extensionBootstrap?.remoteConfig.appliedLayerIds.length ?? 0) !== 1 ? 's' : ''} applied` },
                ...(extensionBootstrap?.compatibility.status ? [{ label: extensionBootstrap.compatibility.status }] : []),
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            <ExtensionControlClient
              initialRequest={extensionBootstrapRequest!}
              initialResult={extensionBootstrap}
              initialUsageEvent={{
                installationId: extensionBootstrapRequest!.installationId,
                eventType: 'extension.quiz_answer_requested',
                occurredAt: new Date().toISOString(),
                payload: { questionType: 'multiple_choice', surface: 'content_script', answerMode: 'instant' },
              }}
              usageSummary={usageSummary}
            />
          </>
        ) : // ── Control Plane: Feature Flags ──────────────────────────────
        section.id === 'feature-flags' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${featureFlags?.flags.length ?? 0} flag${(featureFlags?.flags.length ?? 0) !== 1 ? 's' : ''}` },
                { label: canEditFeatureFlags ? 'write access' : 'read-only', warn: !canEditFeatureFlags },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            <FeatureFlagsClient
              canEdit={canEditFeatureFlags}
              flags={featureFlags?.flags ?? []}
              initialPreviewContext={{
                roles: previewRoles,
                userId: session.user.id,
              }}
            />
          </>
        ) : // ── Control Plane: Remote Config ──────────────────────────────
        section.id === 'remote-config' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${remoteConfigState?.activeLayers.length ?? 0} active layer${(remoteConfigState?.activeLayers.length ?? 0) !== 1 ? 's' : ''}` },
                { label: remoteConfigState?.publishDecision.allowed ? 'publish access' : 'publish blocked', warn: !remoteConfigState?.publishDecision.allowed },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {remoteConfigState ? (
              <RemoteConfigClient initialState={remoteConfigState} isConnectedSession={isConnectedSession} />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Remote Config</span>
                <h2>Remote config unavailable.</h2>
                <p>The API did not return an active remote config snapshot for this context.</p>
              </section>
            )}
          </>
        ) : // ── Control Plane: AI Routing ─────────────────────────────────
        section.id === 'ai-routing' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminProviderGovernance?.items.length ?? 0} credential${(adminProviderGovernance?.items.length ?? 0) !== 1 ? 's' : ''}` },
                { label: `${adminProviderGovernance?.providerBreakdown.filter((e) => e.totalCredentials > 0).length ?? 0} active provider${(adminProviderGovernance?.providerBreakdown.filter((e) => e.totalCredentials > 0).length ?? 0) !== 1 ? 's' : ''}` },
                ...(adminProviderGovernance?.aiAccessPolicy.mode ? [{ label: `policy: ${adminProviderGovernance.aiAccessPolicy.mode}` }] : []),
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {adminProviderGovernance ? (
              <AdminAiProvidersClient governance={adminProviderGovernance} isConnectedSession={isConnectedSession} />
            ) : (
              <section className="empty-state">
                <span className="micro-label">AI Routing</span>
                <h2>Provider governance unavailable.</h2>
                <p>The API did not return an admin provider governance snapshot for this context.</p>
              </section>
            )}
          </>
        ) : (
          // ── Fallback ─────────────────────────────────────────────────
          <section className="panel">
            <span className="micro-label">{section.groupLabel}</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </section>
        )
      ) : (
        <section className="empty-state">
          <span className="micro-label">Access restricted</span>
          <h2>You don&apos;t have permission to view this section.</h2>
          <p>Your account does not have the required permissions for this admin section.</p>
          <a className="btn-ghost" href="/admin">Back to admin</a>
        </section>
      )}
    </SiteShell>
  );
}
