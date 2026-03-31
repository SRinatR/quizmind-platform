import { buildAccessContext } from '@quizmind/auth';
import {
  type AdminExtensionFleetFilters,
  type AdminLogFilters,
  type AdminWebhookFilters,
  type ExtensionBootstrapRequest,
  type SupportTicketQueueFilters,
  type UsageEventPayload,
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
  getSupportImpersonationSessions,
  getSupportTickets,
  getUsageSummary,
  resolvePersona,
  simulateExtensionBootstrap,
} from '../../../lib/api';
import { getVisibleAdminSections } from '../../../features/navigation/visibility';
import { ExtensionControlClient } from './extension-control-client';
import { FeatureFlagsClient } from './feature-flags-client';
import { CompatibilityClient } from './compatibility-client';
import { AdminAiProvidersClient } from './admin-ai-providers-client';
import { RemoteConfigClient } from './remote-config-client';
import { SupportSessionsClient } from './support-sessions-client';
import { SupportTicketsClient } from './support-tickets-client';
import { UsersDirectoryClient } from './users-directory-client';
import { UsageExplorerClient } from './usage-explorer-client';
import { LogsExplorerClient } from './logs-explorer-client';
import { WebhooksClient } from './webhooks-client';
import { ExtensionFleetClient } from './extension-fleet-client';

interface AdminSectionPageProps {
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? undefined;
  }

  return value ?? undefined;
}

function readIntegerSearchParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): number | undefined {
  const rawValue = readSearchParam(searchParams, key);

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatTrendBucketLabel(bucketStart: string): string {
  const timestamp = Date.parse(bucketStart);

  if (!Number.isFinite(timestamp)) {
    return bucketStart;
  }

  return `${bucketStart.slice(5, 16).replace('T', ' ')} UTC`;
}

function createInitialExtensionBootstrapRequest(input: {
  sessionUserId: string;
  workspaceId?: string;
}): ExtensionBootstrapRequest {
  return {
    installationId: input.workspaceId ? `sim-${input.workspaceId}-chrome` : 'sim-local-browser',
    userId: input.sessionUserId,
    workspaceId: input.workspaceId,
    environment: 'development',
    handshake: {
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilities: ['quiz-capture', 'history-sync', 'remote-sync'],
      browser: 'chrome',
    },
  };
}

function createInitialUsageEvent(input: {
  installationId: string;
  workspaceId?: string;
}): UsageEventPayload {
  return {
    installationId: input.installationId,
    workspaceId: input.workspaceId,
    eventType: 'extension.quiz_answer_requested',
    occurredAt: new Date().toISOString(),
    payload: {
      questionType: 'multiple_choice',
      surface: 'content_script',
      answerMode: 'instant',
    },
  };
}

export default async function AdminSectionPage({ params, searchParams }: AdminSectionPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const isAdmin = session ? isAdminSession(session) : false;

  // Block non-admin access early before expensive data fetching
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

  const workspaceId = readSearchParam(resolvedSearchParams, 'workspaceId') ?? session?.workspaces[0]?.id;
  const sessionWorkspaceId = workspaceId;
  const isSecurityRoute = resolvedParams.section === 'security';
  const supportTicketFilters: Partial<SupportTicketQueueFilters> = {
    preset: readSearchParam(resolvedSearchParams, 'ticketPreset') as SupportTicketQueueFilters['preset'] | undefined,
    status: readSearchParam(resolvedSearchParams, 'ticketStatus') as SupportTicketQueueFilters['status'] | undefined,
    ownership: readSearchParam(resolvedSearchParams, 'ticketOwnership') as
      | SupportTicketQueueFilters['ownership']
      | undefined,
    search: readSearchParam(resolvedSearchParams, 'ticketSearch'),
    limit: readIntegerSearchParam(resolvedSearchParams, 'ticketLimit'),
    timelineLimit: readIntegerSearchParam(resolvedSearchParams, 'ticketTimeline'),
  };
  const requestedLogStream = readSearchParam(
    resolvedSearchParams,
    'logStream',
  ) as AdminLogFilters['stream'] | undefined;
  const adminLogFilters: Partial<AdminLogFilters> = {
    ...(sessionWorkspaceId ? { workspaceId: sessionWorkspaceId } : {}),
    stream: requestedLogStream ?? (isSecurityRoute ? 'security' : undefined),
    severity: readSearchParam(resolvedSearchParams, 'logSeverity') as AdminLogFilters['severity'] | undefined,
    search: readSearchParam(resolvedSearchParams, 'logSearch'),
    limit: readIntegerSearchParam(resolvedSearchParams, 'logLimit'),
  };
  const adminWebhookFilters: Partial<AdminWebhookFilters> = {
    provider: readSearchParam(resolvedSearchParams, 'webhookProvider') as
      | AdminWebhookFilters['provider']
      | undefined,
    status: readSearchParam(resolvedSearchParams, 'webhookStatus') as AdminWebhookFilters['status'] | undefined,
    search: readSearchParam(resolvedSearchParams, 'webhookSearch'),
    limit: readIntegerSearchParam(resolvedSearchParams, 'webhookLimit'),
  };
  const extensionFleetFilters: Partial<AdminExtensionFleetFilters> = {
    ...(sessionWorkspaceId ? { workspaceId: sessionWorkspaceId } : {}),
    installationId: readSearchParam(resolvedSearchParams, 'fleetInstallationId'),
    compatibility: readSearchParam(resolvedSearchParams, 'installationCompatibility') as
      | AdminExtensionFleetFilters['compatibility']
      | undefined,
    connection: readSearchParam(resolvedSearchParams, 'installationConnection') as
      | AdminExtensionFleetFilters['connection']
      | undefined,
    search: readSearchParam(resolvedSearchParams, 'installationSearch'),
    limit: readIntegerSearchParam(resolvedSearchParams, 'installationLimit'),
  };
  const extensionBootstrapRequest = session
    ? createInitialExtensionBootstrapRequest({
        sessionUserId: session.user.id,
        workspaceId: sessionWorkspaceId,
      })
    : null;
  const [
    featureFlags,
    adminProviderGovernance,
    compatibilityRules,
    adminUsers,
    remoteConfigState,
    supportImpersonationSessions,
    supportTickets,
    usageSummary,
    adminExtensionFleet,
    adminLogs,
    adminSecurity,
    adminWebhooks,
  ] =
    await Promise.all([
      getFeatureFlags(persona, accessToken),
      resolvedParams.section === 'ai-providers'
        ? getAdminProviderGovernance(sessionWorkspaceId, accessToken)
        : Promise.resolve(null),
      resolvedParams.section === 'compatibility'
        ? getCompatibilityRules(persona, accessToken)
        : Promise.resolve(null),
      getAdminUsers(persona, accessToken),
      getRemoteConfigState(persona, sessionWorkspaceId, accessToken),
      getSupportImpersonationSessions(persona, accessToken),
      getSupportTickets(persona, accessToken, supportTicketFilters),
      (resolvedParams.section === 'extension-control' || resolvedParams.section === 'usage') && sessionWorkspaceId
        ? getUsageSummary(persona, sessionWorkspaceId, accessToken)
        : Promise.resolve(null),
      resolvedParams.section === 'extension-fleet'
        ? getAdminExtensionFleet(persona, extensionFleetFilters, accessToken)
        : Promise.resolve(null),
      resolvedParams.section === 'logs'
        ? getAdminLogs(persona, adminLogFilters, accessToken)
        : Promise.resolve(null),
      resolvedParams.section === 'security'
        ? getAdminSecurity(persona, adminLogFilters, accessToken)
        : Promise.resolve(null),
      resolvedParams.section === 'webhooks'
        ? getAdminWebhooks(persona, adminWebhookFilters, accessToken)
        : Promise.resolve(null),
    ]);
  const extensionBootstrap =
    resolvedParams.section === 'extension-control' && extensionBootstrapRequest
      ? await simulateExtensionBootstrap(extensionBootstrapRequest, accessToken)
      : null;
  const isConnectedSession = session?.personaKey === 'connected-user';
  const canEditFeatureFlags = Boolean(isConnectedSession && featureFlags?.writeDecision.allowed);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const canManageSupportSessions = Boolean(isConnectedSession && supportImpersonationSessions?.accessDecision.allowed);
  const canManageUserAccess = Boolean(isConnectedSession && adminUsers?.writeDecision.allowed);
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context, sessionWorkspaceId) : [];
  const section = visibleSections.find((item) => item.href.endsWith(`/${resolvedParams.section}`));
  const previewRoles = session
    ? [
        ...session.principal.systemRoles,
        ...(sessionWorkspaceId
          ? session.principal.workspaceMemberships
              .filter((membership) => membership.workspaceId === sessionWorkspaceId)
              .map((membership) => membership.role)
          : []),
      ]
    : [];

  return (
    <SiteShell
      apiState={`Connected \u2014 ${sessionLabel}`}
      currentPersona={persona}
      description=""
      eyebrow="Admin"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname={`/admin/${resolvedParams.section}`}
      showPersonaSwitcher={false}
      title={section?.title ?? resolvedParams.section}
    >
      {section && session ? (
        section.id === 'support' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {supportImpersonationSessions?.items.length ?? 0} recent
                    {(supportImpersonationSessions?.items.length ?? 0) === 1 ? ' session' : ' sessions'}
                  </span>
                  <span className="tag">
                    {supportTickets?.items.length ?? 0} visible
                    {(supportTickets?.items.length ?? 0) === 1 ? ' ticket' : ' tickets'}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Support Activity</span>
                <h2>Recent impersonation history</h2>
                {supportImpersonationSessions ? (
                  <SupportSessionsClient
                    canEndSupportSessions={canManageSupportSessions}
                    isConnectedSession={isConnectedSession}
                    items={supportImpersonationSessions.items}
                  />
                ) : (
                  <p>No impersonation sessions have been recorded yet for this environment.</p>
                )}
              </article>
            </section>
            <section className="panel">
              <span className="micro-label">Support Queue</span>
              <h2>Filtered support queue</h2>
              {supportTickets ? (
                <SupportTicketsClient
                  canStartSupportSessions={canManageSupportSessions}
                  currentUserId={session.user.id}
                  favoritePresets={supportTickets.favoritePresets}
                  filters={supportTickets.filters}
                  isConnectedSession={isConnectedSession}
                  items={supportTickets.items}
                />
              ) : (
                <p>No support tickets are available in this environment.</p>
              )}
            </section>
          </>
        ) : section.id === 'users' ? (
          <section className="split-grid">
            <article className="panel">
              <span className="micro-label">Section</span>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
              <div className="tag-row">
                <span className="tag">
                  {adminUsers?.items.length ?? 0} visible
                  {(adminUsers?.items.length ?? 0) === 1 ? ' user' : ' users'}
                </span>
              </div>
            </article>
            <article className="panel">
              <span className="micro-label">Directory</span>
              <h2>Connected user directory</h2>
              {adminUsers ? (
                <UsersDirectoryClient
                  canManageUserAccess={canManageUserAccess}
                  canStartSupportSessions={canManageSupportSessions}
                  currentUserId={session.user.id}
                  isConnectedSession={isConnectedSession}
                  items={adminUsers.items}
                  workspaceOptions={session.workspaces.map((workspace) => ({
                    id: workspace.id,
                    name: workspace.name,
                    role: workspace.role,
                  }))}
                />
              ) : (
                <p>No users are available in the directory for this environment.</p>
              )}
            </article>
          </section>
        ) : section.id === 'logs' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {adminLogs?.items.length ?? 0} visible
                    {(adminLogs?.items.length ?? 0) === 1 ? ' event' : ' events'}
                  </span>
                  <span className="tag">
                    {adminLogs
                      ? adminLogs.streamCounts.audit +
                        adminLogs.streamCounts.activity +
                        adminLogs.streamCounts.security +
                        adminLogs.streamCounts.domain
                      : 0}{' '}
                    matched
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Visibility</span>
                <h2>Current log scope</h2>
                {adminLogs ? (
                  <div className="list-stack">
                    <div className="list-item">
                      <strong>Workspace</strong>
                      <p>{adminLogs.workspace?.name ?? 'No workspace scope selected.'}</p>
                    </div>
                    <div className="list-item">
                      <strong>Filter</strong>
                      <p>
                        {adminLogs.filters.stream} | {adminLogs.filters.severity}
                        {adminLogs.filters.search ? ` | ${adminLogs.filters.search}` : ''}
                      </p>
                    </div>
                    <div className="list-item">
                      <strong>Limit</strong>
                      <p>{adminLogs.filters.limit}</p>
                    </div>
                  </div>
                ) : (
                  <p>Admin log state is unavailable for this environment.</p>
                )}
              </article>
            </section>
            {adminLogs ? (
                <LogsExplorerClient
                  canExportLogs={adminLogs.exportDecision.allowed}
                  defaultStreamOnReset="all"
                  isConnectedSession={isConnectedSession}
                  snapshot={adminLogs}
                  workspaceOptions={session.workspaces.map((workspace) => ({
                    id: workspace.id,
                    name: workspace.name,
                    role: workspace.role,
                  }))}
                />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Logs</span>
                <h2>Admin log stream state is unavailable.</h2>
                <p>The API did not return an audit log snapshot for this workspace context.</p>
              </section>
            )}
          </>
        ) : section.id === 'security' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {adminSecurity?.items.length ?? 0} visible
                    {(adminSecurity?.items.length ?? 0) === 1 ? ' event' : ' events'}
                  </span>
                  <span className="tag">security stream {adminSecurity?.streamCounts.security ?? 0}</span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Security posture</span>
                <h2>Operational security checkpoints</h2>
                {adminSecurity ? (
                  <div className="list-stack">
                    <div className="list-item">
                      <strong>Workspace</strong>
                      <p>{adminSecurity.workspace?.name ?? 'No workspace scope selected.'}</p>
                    </div>
                    <div className="list-item">
                      <strong>Filter</strong>
                      <p>
                        {adminSecurity.filters.stream} | {adminSecurity.filters.severity}
                        {adminSecurity.filters.search ? ` | ${adminSecurity.filters.search}` : ''}
                      </p>
                    </div>
                    <div className="list-item">
                      <strong>Limit</strong>
                      <p>{adminSecurity.filters.limit}</p>
                    </div>
                    <div className="list-item">
                      <strong>Signals requiring review</strong>
                      <p>
                        {adminSecurity.findings.totalFailures} event
                        {adminSecurity.findings.totalFailures === 1 ? '' : 's'} currently flagged.
                      </p>
                    </div>
                    <div className="list-item">
                      <strong>Extension lifecycle incidents</strong>
                      <p>
                        {adminSecurity.findings.extensionBootstrapRefreshFailures +
                          adminSecurity.findings.extensionRuntimeErrors}{' '}
                        failure
                        {adminSecurity.findings.extensionBootstrapRefreshFailures +
                          adminSecurity.findings.extensionRuntimeErrors ===
                        1
                          ? ''
                          : 's'}{' '}
                        with {adminSecurity.findings.extensionReconnectRequests} reconnect request
                        {adminSecurity.findings.extensionReconnectRequests === 1 ? '' : 's'}, {adminSecurity.findings.extensionReconnectRecoveries}{' '}
                        recovered session{adminSecurity.findings.extensionReconnectRecoveries === 1 ? '' : 's'}, and{' '}
                        {adminSecurity.findings.extensionReconnectOutstanding} unresolved reconnect
                        {adminSecurity.findings.extensionReconnectOutstanding === 1 ? '' : 's'}.
                      </p>
                    </div>
                    <div className="list-item">
                      <strong>Session token control actions</strong>
                      <p>
                        {adminSecurity.findings.extensionSessionRevocations} revocation action
                        {adminSecurity.findings.extensionSessionRevocations === 1 ? '' : 's'} and{' '}
                        {adminSecurity.findings.extensionSessionRotations} rotation
                        {adminSecurity.findings.extensionSessionRotations === 1 ? '' : 's'}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p>Security admin state is unavailable for this environment.</p>
                )}
              </article>
            </section>
            {adminSecurity ? (
              <>
                <section className="panel">
                  <span className="micro-label">Findings</span>
                  <h2>Current detection summary</h2>
                  <div className="tag-row">
                    <span className="tag warn">auth failures {adminSecurity.findings.suspiciousAuthFailures}</span>
                    <span className="tag">impersonation {adminSecurity.findings.impersonationEvents}</span>
                    <span className="tag">provider credentials {adminSecurity.findings.providerCredentialEvents}</span>
                    <span className="tag">privileged actions {adminSecurity.findings.privilegedActionEvents}</span>
                    <span className="tag warn">
                      bootstrap refresh failures {adminSecurity.findings.extensionBootstrapRefreshFailures}
                    </span>
                    <span className="tag">
                      reconnect requests {adminSecurity.findings.extensionReconnectRequests}
                    </span>
                    <span className="tag">reconnected {adminSecurity.findings.extensionReconnectRecoveries}</span>
                    <span className={adminSecurity.findings.extensionReconnectOutstanding > 0 ? 'tag warn' : 'tag'}>
                      unresolved reconnects {adminSecurity.findings.extensionReconnectOutstanding}
                    </span>
                    <span className="tag">session revocations {adminSecurity.findings.extensionSessionRevocations}</span>
                    <span className="tag">session rotations {adminSecurity.findings.extensionSessionRotations}</span>
                    <span className="tag warn">runtime errors {adminSecurity.findings.extensionRuntimeErrors}</span>
                  </div>
                  <div className="tag-row">
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({
                        section: resolvedParams.section,
                        currentSearchParams: resolvedSearchParams,
                        overrides: {
                          logStream: 'security',
                          logSeverity: 'all',
                          logSearch: undefined,
                        },
                      })}
                    >
                      all security signals ({adminSecurity.items.length})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({
                        section: resolvedParams.section,
                        currentSearchParams: resolvedSearchParams,
                        overrides: {
                          logStream: 'security',
                          logSeverity: 'warn',
                          logSearch: 'auth.login_failed',
                        },
                      })}
                    >
                      auth failures ({adminSecurity.findings.suspiciousAuthFailures})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({
                        section: resolvedParams.section,
                        currentSearchParams: resolvedSearchParams,
                        overrides: {
                          logStream: 'security',
                          logSeverity: 'warn',
                          logSearch: 'extension.bootstrap_refresh_failed',
                        },
                      })}
                    >
                      bootstrap refresh failures ({adminSecurity.findings.extensionBootstrapRefreshFailures})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({
                        section: resolvedParams.section,
                        currentSearchParams: resolvedSearchParams,
                        overrides: {
                          logStream: 'security',
                          logSeverity: 'all',
                          logSearch: 'extension.installation_reconnect_requested',
                        },
                      })}
                    >
                      reconnect requests ({adminSecurity.findings.extensionReconnectRequests})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({
                        section: resolvedParams.section,
                        currentSearchParams: resolvedSearchParams,
                        overrides: {
                          logStream: 'security',
                          logSeverity: 'all',
                          logSearch: 'extension.installation_reconnected',
                        },
                      })}
                    >
                      reconnected ({adminSecurity.findings.extensionReconnectRecoveries})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({
                        section: resolvedParams.section,
                        currentSearchParams: resolvedSearchParams,
                        overrides: {
                          logStream: 'security',
                          logSeverity: 'all',
                          logSearch: 'extension.installation_session_revoked',
                        },
                      })}
                    >
                      session revocations ({adminSecurity.findings.extensionSessionRevocations})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({
                        section: resolvedParams.section,
                        currentSearchParams: resolvedSearchParams,
                        overrides: {
                          logStream: 'security',
                          logSeverity: 'all',
                          logSearch: 'extension.installation_session_rotated',
                        },
                      })}
                    >
                      session rotations ({adminSecurity.findings.extensionSessionRotations})
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={buildAdminSectionHref({
                        section: resolvedParams.section,
                        currentSearchParams: resolvedSearchParams,
                        overrides: {
                          logStream: 'security',
                          logSeverity: 'warn',
                          logSearch: 'extension.runtime_error',
                        },
                      })}
                    >
                      runtime errors ({adminSecurity.findings.extensionRuntimeErrors})
                    </Link>
                  </div>
                </section>
                <section className="panel">
                  <span className="micro-label">Trend</span>
                  <h2>
                    Extension lifecycle trend ({adminSecurity.lifecycleTrend.windowHours}h window,{' '}
                    {adminSecurity.lifecycleTrend.bucketHours}h buckets)
                  </h2>
                  <div className="tag-row">
                    <span className="tag">
                      {adminSecurity.lifecycleTrend.buckets.length} bucket
                      {adminSecurity.lifecycleTrend.buckets.length === 1 ? '' : 's'}
                    </span>
                    <span className="tag">
                      {adminSecurity.items.length} visible security event
                      {adminSecurity.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="list-stack">
                    {adminSecurity.lifecycleTrend.buckets.map((bucket) => (
                      <div className="list-item" key={bucket.bucketStart}>
                        <strong>{formatTrendBucketLabel(bucket.bucketStart)}</strong>
                        <p>
                          failures {bucket.extensionBootstrapRefreshFailures + bucket.extensionRuntimeErrors}, reconnect
                          requests {bucket.extensionReconnectRequests}, recoveries{' '}
                          {bucket.extensionReconnectRecoveries}, revocations {bucket.extensionSessionRevocations},
                          rotations {bucket.extensionSessionRotations}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <span className="micro-label">Controls</span>
                  <h2>Security hardening checkpoints</h2>
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
                  workspaceOptions={session.workspaces.map((workspace) => ({
                    id: workspace.id,
                    name: workspace.name,
                    role: workspace.role,
                  }))}
                />
              </>
            ) : (
              <section className="empty-state">
                <span className="micro-label">Security</span>
                <h2>Security admin state is unavailable.</h2>
                <p>The API did not return a security-focused log snapshot for this workspace context.</p>
              </section>
            )}
          </>
        ) : section.id === 'webhooks' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {adminWebhooks?.items.length ?? 0} visible
                    {(adminWebhooks?.items.length ?? 0) === 1 ? ' delivery' : ' deliveries'}
                  </span>
                  <span className={adminWebhooks && adminWebhooks.statusCounts.failed > 0 ? 'tag warn' : 'tag'}>
                    failed {adminWebhooks?.statusCounts.failed ?? 0}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Queue coverage</span>
                <h2>Current worker surface</h2>
                {adminWebhooks ? (
                  <div className="list-stack">
                    <div className="list-item">
                      <strong>Queues</strong>
                      <p>{adminWebhooks.queues.length} declared control-plane queues</p>
                    </div>
                    <div className="list-item">
                      <strong>Retry access</strong>
                      <p>{adminWebhooks.retryDecision.allowed ? 'Allowed for this operator.' : 'Read-only inspection mode.'}</p>
                    </div>
                    <div className="list-item">
                      <strong>Filters</strong>
                      <p>
                        {adminWebhooks.filters.provider} | {adminWebhooks.filters.status}
                        {adminWebhooks.filters.search ? ` | ${adminWebhooks.filters.search}` : ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p>Webhook inspection state is unavailable for this environment.</p>
                )}
              </article>
            </section>
            {adminWebhooks ? (
              <WebhooksClient
                isConnectedSession={isConnectedSession}
                snapshot={adminWebhooks}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Webhooks</span>
                <h2>Webhook ops state is unavailable.</h2>
                <p>The API did not return webhook delivery visibility for this environment.</p>
              </section>
            )}
          </>
        ) : section.id === 'feature-flags' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className={canEditFeatureFlags ? 'tag' : 'tag warn'}>
                    {canEditFeatureFlags ? 'write access' : 'read-only'}
                  </span>
                  <span className="tag">
                    {featureFlags?.flags.length ?? 0} defined
                    {(featureFlags?.flags.length ?? 0) === 1 ? ' flag' : ' flags'}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Resolved permissions</span>
                <h2>Current operator context</h2>
                <div className="list-stack">
                  <div className="list-item">
                    <strong>User</strong>
                    <p>{session.user.displayName || session.user.email}</p>
                  </div>
                  <div className="list-item">
                    <strong>Workspace</strong>
                    <p>{sessionWorkspaceId ?? 'No workspace selected for preview context.'}</p>
                  </div>
                  <div className="list-item">
                    <strong>Roles</strong>
                    <p>{previewRoles.join(', ') || 'No system or workspace roles resolved.'}</p>
                  </div>
                </div>
              </article>
            </section>
            <FeatureFlagsClient
              canEdit={canEditFeatureFlags}
              flags={featureFlags?.flags ?? []}
              initialPreviewContext={{
                roles: previewRoles,
                userId: session.user.id,
                workspaceId: sessionWorkspaceId,
              }}
            />
          </>
        ) : section.id === 'compatibility' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className={compatibilityRules?.publishDecision.allowed ? 'tag' : 'tag warn'}>
                    {compatibilityRules?.publishDecision.allowed ? 'publish access' : 'publish blocked'}
                  </span>
                  <span className="tag">
                    {compatibilityRules?.items.length ?? 0} rule
                    {(compatibilityRules?.items.length ?? 0) === 1 ? '' : 's'}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Compatibility baseline</span>
                <h2>Latest extension gate</h2>
                {compatibilityRules?.items[0] ? (
                  <div className="list-stack">
                    <div className="list-item">
                      <strong>Version policy</strong>
                      <p>
                        min {compatibilityRules.items[0].minimumVersion} | recommended{' '}
                        {compatibilityRules.items[0].recommendedVersion}
                      </p>
                    </div>
                    <div className="list-item">
                      <strong>Verdict</strong>
                      <p>{compatibilityRules.items[0].resultStatus}</p>
                    </div>
                    <div className="list-item">
                      <strong>Reason</strong>
                      <p>{compatibilityRules.items[0].reason ?? 'No explicit override reason on the latest rule.'}</p>
                    </div>
                  </div>
                ) : (
                  <p>No compatibility rules are available for this environment.</p>
                )}
              </article>
            </section>
            {compatibilityRules ? (
              <CompatibilityClient initialState={compatibilityRules} isConnectedSession={isConnectedSession} />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Compatibility</span>
                <h2>Compatibility rule state is unavailable.</h2>
                <p>The API did not return a compatibility rule snapshot for this environment.</p>
              </section>
            )}
          </>
        ) : section.id === 'ai-providers' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {adminProviderGovernance?.items.length ?? 0} visible
                    {(adminProviderGovernance?.items.length ?? 0) === 1 ? ' credential' : ' credentials'}
                  </span>
                  <span className="tag">
                    {adminProviderGovernance?.providerBreakdown.filter((entry) => entry.totalCredentials > 0).length ?? 0} active
                    {' '}providers
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Governance context</span>
                <h2>Selected workspace scope</h2>
                {adminProviderGovernance ? (
                  <div className="list-stack">
                    <div className="list-item">
                      <strong>Workspace</strong>
                      <p>{adminProviderGovernance.workspace?.name ?? 'No workspace resolved.'}</p>
                    </div>
                    <div className="list-item">
                      <strong>Policy mode</strong>
                      <p>{adminProviderGovernance.aiAccessPolicy.mode}</p>
                    </div>
                    <div className="list-item">
                      <strong>Routing rule</strong>
                      <p>{adminProviderGovernance.aiAccessPolicy.reason ?? 'Proxy routing remains platform-managed.'}</p>
                    </div>
                  </div>
                ) : (
                  <p>Provider governance state is unavailable for this environment.</p>
                )}
              </article>
            </section>
            {adminProviderGovernance ? (
              <AdminAiProvidersClient
                governance={adminProviderGovernance}
                isConnectedSession={isConnectedSession}
                workspaceOptions={session.workspaces.map((workspace) => ({
                  id: workspace.id,
                  name: workspace.name,
                  role: workspace.role,
                }))}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">AI Providers</span>
                <h2>Provider governance is unavailable.</h2>
                <p>The API did not return an admin provider governance snapshot for this workspace context.</p>
              </section>
            )}
          </>
        ) : section.id === 'usage' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {usageSummary?.quotas.length ?? 0} quota
                    {(usageSummary?.quotas.length ?? 0) === 1 ? '' : 's'}
                  </span>
                  <span className="tag">
                    {usageSummary?.installations.length ?? 0} installation
                    {(usageSummary?.installations.length ?? 0) === 1 ? '' : 's'}
                  </span>
                  <span className={usageSummary?.exportDecision.allowed ? 'tag' : 'tag warn'}>
                    {usageSummary?.exportDecision.allowed ? 'export access' : 'read-only'}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Usage context</span>
                <h2>Current workspace scope</h2>
                {usageSummary ? (
                  <div className="list-stack">
                    <div className="list-item">
                      <strong>Workspace</strong>
                      <p>{usageSummary.workspace.name}</p>
                    </div>
                    <div className="list-item">
                      <strong>Quota period</strong>
                      <p>
                        {usageSummary.currentPeriodStart && usageSummary.currentPeriodEnd
                          ? `${usageSummary.currentPeriodStart} → ${usageSummary.currentPeriodEnd}`
                          : 'Current period unavailable'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p>Usage summary is unavailable for this workspace context.</p>
                )}
              </article>
            </section>
            {usageSummary ? (
              <UsageExplorerClient
                canExportUsage={usageSummary.exportDecision.allowed}
                isConnectedSession={isConnectedSession}
                usageSummary={usageSummary}
                workspaceOptions={session.workspaces.map((workspace) => ({
                  id: workspace.id,
                  name: workspace.name,
                  role: workspace.role,
                }))}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Usage</span>
                <h2>Usage explorer state is unavailable.</h2>
                <p>The API did not return a usage snapshot for this workspace context.</p>
              </section>
            )}
          </>
        ) : section.id === 'extension-fleet' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {adminExtensionFleet?.counts.total ?? 0} visible
                    {(adminExtensionFleet?.counts.total ?? 0) === 1 ? ' installation' : ' installations'}
                  </span>
                  <span className={adminExtensionFleet && adminExtensionFleet.counts.reconnectRequired > 0 ? 'tag warn' : 'tag'}>
                    reconnect {adminExtensionFleet?.counts.reconnectRequired ?? 0}
                  </span>
                  <span className={adminExtensionFleet && adminExtensionFleet.counts.unsupported > 0 ? 'tag warn' : 'tag'}>
                    unsupported {adminExtensionFleet?.counts.unsupported ?? 0}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Fleet context</span>
                <h2>Selected workspace scope</h2>
                {adminExtensionFleet ? (
                  <div className="list-stack">
                    <div className="list-item">
                      <strong>Workspace</strong>
                      <p>{adminExtensionFleet.workspace.name}</p>
                    </div>
                    <div className="list-item">
                      <strong>Current filters</strong>
                      <p>
                        {adminExtensionFleet.filters.compatibility} | {adminExtensionFleet.filters.connection}
                        {adminExtensionFleet.filters.search ? ` | "${adminExtensionFleet.filters.search}"` : ''}
                      </p>
                    </div>
                    <div className="list-item">
                      <strong>Compatibility drift</strong>
                      <p>
                        warnings {adminExtensionFleet.counts.supportedWithWarnings} | deprecated{' '}
                        {adminExtensionFleet.counts.deprecated}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p>Extension fleet state is unavailable for this workspace context.</p>
                )}
              </article>
            </section>
            {adminExtensionFleet ? (
              <ExtensionFleetClient
                snapshot={adminExtensionFleet}
                workspaceOptions={session.workspaces.map((workspace) => ({
                  id: workspace.id,
                  name: workspace.name,
                  role: workspace.role,
                }))}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Extension Fleet</span>
                <h2>Extension fleet state is unavailable.</h2>
                <p>The API did not return a fleet snapshot for this workspace context.</p>
              </section>
            )}
          </>
        ) : section.id === 'extension-control' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {extensionBootstrap?.featureFlags.length ?? 0} resolved
                    {(extensionBootstrap?.featureFlags.length ?? 0) === 1 ? ' flag' : ' flags'}
                  </span>
                  <span className="tag">
                    {extensionBootstrap?.remoteConfig.appliedLayerIds.length ?? 0} applied
                    {(extensionBootstrap?.remoteConfig.appliedLayerIds.length ?? 0) === 1 ? ' layer' : ' layers'}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Bootstrap summary</span>
                <h2>Current simulation baseline</h2>
                <div className="list-stack">
                  <div className="list-item">
                    <strong>Workspace</strong>
                    <p>{sessionWorkspaceId ?? 'No workspace binding.'}</p>
                  </div>
                  <div className="list-item">
                    <strong>Operator</strong>
                    <p>{session.user.displayName || session.user.email}</p>
                  </div>
                  <div className="list-item">
                    <strong>Compatibility status</strong>
                    <p>{extensionBootstrap?.compatibility.status ?? 'No bootstrap snapshot available yet.'}</p>
                  </div>
                </div>
              </article>
            </section>
            <ExtensionControlClient
              initialRequest={extensionBootstrapRequest!}
              initialResult={extensionBootstrap}
              initialUsageEvent={createInitialUsageEvent({
                installationId: extensionBootstrapRequest!.installationId,
                workspaceId: sessionWorkspaceId,
              })}
              usageSummary={usageSummary}
              workspaceOptions={session.workspaces.map((workspace) => ({
                id: workspace.id,
                name: workspace.name,
              }))}
            />
          </>
        ) : section.id === 'remote-config' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className={remoteConfigState?.publishDecision.allowed ? 'tag' : 'tag warn'}>
                    {remoteConfigState?.publishDecision.allowed ? 'publish access' : 'publish blocked'}
                  </span>
                  <span className="tag">
                    {remoteConfigState?.activeLayers.length ?? 0} active
                    {(remoteConfigState?.activeLayers.length ?? 0) === 1 ? ' layer' : ' layers'}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Resolved preview</span>
                <h2>Current control-plane output</h2>
                {remoteConfigState ? (
                  <div className="list-stack">
                    <div className="list-item">
                      <strong>Applied layers</strong>
                      <p>{remoteConfigState.preview.appliedLayerIds.join(', ') || 'No layers matched the preview context.'}</p>
                    </div>
                    <div className="list-item">
                      <strong>Preview context</strong>
                      <p>
                        env {remoteConfigState.previewContext.environment ?? 'n/a'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p>Remote config state is unavailable for this environment.</p>
                )}
              </article>
            </section>
            {remoteConfigState ? (
              <RemoteConfigClient initialState={remoteConfigState} isConnectedSession={isConnectedSession} />
            ) : (
              <section className="empty-state">
                <span className="micro-label">Control-plane</span>
                <h2>Remote config state is unavailable.</h2>
                <p>The API did not return an active remote config snapshot for this workspace context.</p>
              </section>
            )}
          </>
        ) : (
          <section className="split-grid">
            <article className="panel">
              <span className="micro-label">Section</span>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </article>
            <article className="panel">
              <span className="micro-label">Control-Plane State</span>
              <h2>Feature flag snapshot</h2>
              <div className="list-stack">
                {(featureFlags?.flags ?? []).map((flag) => (
                  <div className="list-item" key={flag.key}>
                    <strong>{flag.key}</strong>
                    <p>{flag.status}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )
      ) : (
        <section className="empty-state">
          <span className="micro-label">Access restricted</span>
          <h2>You don&apos;t have permission to view this section.</h2>
          <p>
            Your account does not have the required permissions for this admin section.
          </p>
          <a className="btn-ghost" href="/admin">Back to admin</a>
        </section>
      )}
    </SiteShell>
  );
}



