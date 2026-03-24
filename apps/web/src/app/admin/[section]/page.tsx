import { buildAccessContext } from '@quizmind/auth';
import {
  type ExtensionBootstrapRequest,
  type SupportTicketQueueFilters,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getAdminUsers,
  getAdminPlans,
  getBillingPlans,
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
import { PlansClient } from './plans-client';
import { RemoteConfigClient } from './remote-config-client';
import { SupportSessionsClient } from './support-sessions-client';
import { SupportTicketsClient } from './support-tickets-client';
import { UsersDirectoryClient } from './users-directory-client';

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

function createInitialExtensionBootstrapRequest(input: {
  sessionUserId: string;
  workspaceId?: string;
}): ExtensionBootstrapRequest {
  return {
    installationId: input.workspaceId ? `sim-${input.workspaceId}-chrome` : 'sim-local-browser',
    userId: input.sessionUserId,
    workspaceId: input.workspaceId,
    environment: 'development',
    planCode: 'pro',
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
  const workspaceId = readSearchParam(resolvedSearchParams, 'workspaceId') ?? session?.workspaces[0]?.id;
  const sessionWorkspaceId = workspaceId;
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
  const extensionBootstrapRequest = session
    ? createInitialExtensionBootstrapRequest({
        sessionUserId: session.user.id,
        workspaceId: sessionWorkspaceId,
      })
    : null;
  const [
    featureFlags,
    billingPlans,
    adminPlans,
    adminUsers,
    remoteConfigState,
    supportImpersonationSessions,
    supportTickets,
    usageSummary,
  ] =
    await Promise.all([
      getFeatureFlags(persona, accessToken),
      getBillingPlans(),
      getAdminPlans(accessToken),
      getAdminUsers(persona, accessToken),
      getRemoteConfigState(persona, sessionWorkspaceId, accessToken),
      getSupportImpersonationSessions(persona, accessToken),
      getSupportTickets(persona, accessToken, supportTicketFilters),
      resolvedParams.section === 'extension-control' && sessionWorkspaceId
        ? getUsageSummary(persona, sessionWorkspaceId, accessToken)
        : Promise.resolve(null),
    ]);
  const extensionBootstrap =
    resolvedParams.section === 'extension-control' && extensionBootstrapRequest
      ? await simulateExtensionBootstrap(extensionBootstrapRequest, accessToken)
      : null;
  const isConnectedSession = session?.personaKey === 'connected-user';
  const canEditFeatureFlags = Boolean(isConnectedSession && session?.permissions.includes('feature_flags:write'));
  const canManagePlans = Boolean(isConnectedSession && session?.permissions.includes('plans:manage'));
  const sessionLabel = session?.user.displayName || session?.user.email;
  const canManageSupportSessions = Boolean(isConnectedSession && session?.permissions.includes('support:impersonate'));
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
      apiState={
        session ? (isConnectedSession ? `Connected ${sessionLabel}` : `Persona ${session.personaLabel}`) : 'API offline fallback'
      }
      currentPersona={persona}
      description="Admin detail routes reuse the same gating rules as the parent admin shell."
      eyebrow="Admin Route"
      pathname={`/admin/${resolvedParams.section}`}
      showPersonaSwitcher={!isConnectedSession}
      title={section?.title ?? 'Admin route unavailable'}
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
                  canStartSupportSessions={canManageSupportSessions}
                  currentUserId={session.user.id}
                  isConnectedSession={isConnectedSession}
                  items={adminUsers.items}
                />
              ) : (
                <p>No users are available in the directory for this environment.</p>
              )}
            </article>
          </section>
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
                planCode: remoteConfigState?.previewContext.planCode,
                roles: previewRoles,
                userId: session.user.id,
                workspaceId: sessionWorkspaceId,
              }}
              planOptions={Array.from(new Set((billingPlans?.plans ?? []).map((entry) => entry.plan.code)))}
            />
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
                    <p>{sessionWorkspaceId ?? 'No workspace binding; request planCode will be used directly.'}</p>
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
              planOptions={Array.from(new Set((billingPlans?.plans ?? []).map((entry) => entry.plan.code)))}
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
                        env {remoteConfigState.previewContext.environment ?? 'n/a'} | plan {remoteConfigState.previewContext.planCode ?? 'n/a'}
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
        ) : section.id === 'plans' ? (
          <>
            <section className="split-grid">
              <article className="panel">
                <span className="micro-label">Section</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                <div className="tag-row">
                  <span className="tag">
                    {adminPlans?.plans.length ?? 0} visible
                    {(adminPlans?.plans.length ?? 0) === 1 ? ' plan' : ' plans'}
                  </span>
                  <span className={canManagePlans ? 'tag' : 'tag warn'}>
                    {canManagePlans ? 'write access' : 'read-only'}
                  </span>
                </div>
              </article>
              <article className="panel">
                <span className="micro-label">Workspace context</span>
                <h2>Preview anchor</h2>
                <div className="list-stack">
                  <div className="list-item">
                    <strong>Workspace</strong>
                    <p>{sessionWorkspaceId ?? 'No workspace resolved for this admin route.'}</p>
                  </div>
                  <div className="list-item">
                    <strong>Current operator</strong>
                    <p>{session.user.displayName || session.user.email}</p>
                  </div>
                  <div className="list-item">
                    <strong>Resolved preview plan</strong>
                    <p>{remoteConfigState?.previewContext.planCode ?? 'No current plan preview available.'}</p>
                  </div>
                </div>
              </article>
            </section>

            <section className="panel">
              <span className="micro-label">Catalog</span>
              <h2>Catalog editor</h2>
              {adminPlans ? (
                <PlansClient
                  canManagePlans={canManagePlans}
                  currentPlanCode={remoteConfigState?.previewContext.planCode}
                  plans={adminPlans.plans}
                />
              ) : (
                <p>No admin billing catalog is available for this environment.</p>
              )}
            </section>
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
          <span className="micro-label">Route Gate</span>
          <h2>The current persona cannot access this admin section.</h2>
          <p>
            The route exists, but the access model hides it because the required permissions are not present in
            the computed context.
          </p>
        </section>
      )}
    </SiteShell>
  );
}
