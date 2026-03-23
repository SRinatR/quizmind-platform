import { buildAccessContext } from '@quizmind/auth';
import { type SupportTicketQueueFilters } from '@quizmind/contracts';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getAdminUsers,
  getFeatureFlags,
  getSession,
  getSupportImpersonationSessions,
  getSupportTickets,
  resolvePersona,
} from '../../../lib/api';
import { getVisibleAdminSections } from '../../../features/navigation/visibility';
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

export default async function AdminSectionPage({ params, searchParams }: AdminSectionPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
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
  const [session, featureFlags, adminUsers, supportImpersonationSessions, supportTickets] = await Promise.all([
    getSession(persona, accessToken),
    getFeatureFlags(persona, accessToken),
    getAdminUsers(persona, accessToken),
    getSupportImpersonationSessions(persona, accessToken),
    getSupportTickets(persona, accessToken, supportTicketFilters),
  ]);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const workspaceId = session?.workspaces[0]?.id;
  const canManageSupportSessions = Boolean(isConnectedSession && session?.permissions.includes('support:impersonate'));
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context, workspaceId) : [];
  const section = visibleSections.find((item) => item.href.endsWith(`/${resolvedParams.section}`));

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
