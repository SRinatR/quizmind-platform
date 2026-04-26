import { redirect } from 'next/navigation';
import { buildAccessContext } from '@quizmind/auth';
import {
  type AdminLogFilters,
} from '@quizmind/contracts';
import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { isAdminSession } from '../../../lib/admin-guard';
import {
  getAdminProviderGovernance,
  getAdminLogs,
  getAdminUsers,
  getCompatibilityRules,
  getFeatureFlags,
  getRemoteConfigState,
  getUserProfile,
  getSession,
  resolvePersona,
} from '../../../lib/api';
import { ServerPrefsSync } from '../../../lib/preferences';
import { en } from '../../../lib/i18n/en';
import { ru } from '../../../lib/i18n/ru';
import { getVisibleAdminSections, buildVisibleAdminNavGroups } from '../../../features/navigation/visibility';
import { type AdminSection } from '../../../features/admin/sections';
import { AdminAiProvidersClient } from './admin-ai-providers-client';
import { ExtensionControlAdminClient } from './extension-control-admin-client';
import { UsersDirectoryClient } from './users-directory-client';
import { LogsExplorerClient } from './logs-explorer-client';
import { AdminSettingsClient } from './admin-settings-client';

// ── Route aliases ─────────────────────────────────────────────────────────────
const ROUTE_REDIRECTS: Record<string, string> = {
  // Old canonical aliases
  'ai-providers': 'ai-routing',
  support: 'users',
  'access-sessions': 'users',
  // Fragmented operational tabs → unified Logs center
  events: 'logs',
  security: 'logs',
  webhooks: 'logs',
  'extension-fleet': 'logs',
  usage: 'logs',
  'bootstrap-simulator': 'logs',
  // Merged control-plane tabs → unified Extension Control
  compatibility: 'extension-control',
  'feature-flags': 'extension-control',
  'remote-config': 'extension-control',
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

/** Cross-links to sibling sections in the same group. */
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

  // Redirect legacy/fragmented routes, preserving relevant query params
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
  const userProfile = await getUserProfile(accessToken);
  const locale = userProfile?.uiPreferences?.language === 'ru' ? 'ru' : 'en';
  const i18n = locale === 'ru' ? ru : en;
  const adminT = i18n.admin.page;
  const adminUsersT = i18n.admin.users;
  const isAdmin = session ? isAdminSession(session) : false;

  // Block non-admin access early
  if (!session || !isAdmin) {
    const sessionLabel = session?.user.displayName || session?.user.email;
    return (
      <SiteShell
        apiState={session ? `Connected \u2014 ${sessionLabel}` : i18n.shell.notSignedIn}
        currentPersona={persona}
        description=""
        eyebrow={adminT.adminLabel}
        isAdmin={false}
        pathname={`/admin/${resolvedParams.section}`}
        showPersonaSwitcher={false}
        title={adminT.accessRestricted}
      >
        <section className="empty-state">
          <span className="micro-label">{adminT.accessRestricted}</span>
          <h2>{adminT.noPermissionArea}</h2>
          <p>{adminT.adminAccessRequired}</p>
          <div className="link-row" style={{ justifyContent: 'center' }}>
            <a className="btn-primary" href="/app">{adminT.goToDashboard}</a>
            {!session ? <a className="btn-ghost" href="/auth/login">{adminT.signIn}</a> : null}
          </div>
        </section>
      </SiteShell>
    );
  }

  const sec = resolvedParams.section;

  // ── Section-specific filter objects ──────────────────────────────────────────
  const adminLogFilters: Partial<AdminLogFilters> = {
    stream: readSearchParam(resolvedSearchParams, 'logStream') as AdminLogFilters['stream'] | undefined,
    severity: readSearchParam(resolvedSearchParams, 'logSeverity') as AdminLogFilters['severity'] | undefined,
    search: readSearchParam(resolvedSearchParams, 'logSearch'),
    limit: readIntegerSearchParam(resolvedSearchParams, 'logLimit'),
    category: readSearchParam(resolvedSearchParams, 'logCategory') as AdminLogFilters['category'] | undefined,
    source: readSearchParam(resolvedSearchParams, 'logSource') as AdminLogFilters['source'] | undefined,
    status: readSearchParam(resolvedSearchParams, 'logStatus') as AdminLogFilters['status'] | undefined,
    eventType: readSearchParam(resolvedSearchParams, 'logEventType'),
    from: readSearchParam(resolvedSearchParams, 'logFrom'),
    to: readSearchParam(resolvedSearchParams, 'logTo'),
    page: readIntegerSearchParam(resolvedSearchParams, 'logPage'),
  };

  // ── Section-targeted data fetching ───────────────────────────────────────────
  interface LoaderNeeds {
    users?: true;
    logs?: true;
    compatibility?: true;
    flags?: true;
    remoteConfig?: true;
    aiRouting?: true;
  }
  const SECTION_NEEDS: Record<string, LoaderNeeds> = {
    users:               { users: true },
    logs:                { logs: true },
    'extension-control': { compatibility: true, flags: true, remoteConfig: true },
    'ai-routing':        { aiRouting: true },
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
    adminLogs,
  ] = await Promise.all([
    needs.flags ? getFeatureFlags(persona, accessToken) : Promise.resolve(null),
    needs.aiRouting ? getAdminProviderGovernance(accessToken) : Promise.resolve(null),
    needs.compatibility ? getCompatibilityRules(persona, accessToken) : Promise.resolve(null),
    needs.users ? getAdminUsers(persona, accessToken, userFilters) : Promise.resolve(null),
    needs.remoteConfig ? getRemoteConfigState(persona, undefined, accessToken) : Promise.resolve(null),
    needs.logs ? getAdminLogs(persona, adminLogFilters, accessToken) : Promise.resolve(null),
  ]);

  const isConnectedSession = session?.personaKey === 'connected-user';
  const canEditFeatureFlags = Boolean(isConnectedSession && featureFlags?.writeDecision.allowed);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const canManageUserAccess = Boolean(isConnectedSession && adminUsers?.writeDecision.allowed);
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context) : [];
  const visibleNavGroups = context ? buildVisibleAdminNavGroups(context) : [];
  const section = visibleSections.find((item) => item.href.endsWith(`/${sec}`));
  return (
    <SiteShell
      adminNavGroups={visibleNavGroups}
      apiState={`Connected \u2014 ${sessionLabel}`}
      currentPersona={persona}
      description=""
      eyebrow={sec === 'settings' ? adminT.adminSettingsLabel : adminT.adminLabel}
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname={`/admin/${sec}`}
      showPersonaSwitcher={false}
      title={sec === 'settings' ? adminT.settingsTitle : (section?.title ?? sec)}
      userDisplayName={session?.user.displayName ?? undefined}
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      {sec === 'settings' ? (
        <ServerPrefsSync serverPrefs={userProfile?.uiPreferences ?? null} />
      ) : null}
      {section && session ? (
        // ── People: Users ─────────────────────────────────────────────────
        section.id === 'users' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminUsers?.total ?? 0} ${(adminUsers?.total ?? 0) === 1 ? adminT.usersSuffixSingular : adminT.usersSuffixPlural}` },
                { label: canManageUserAccess ? adminUsersT.writeAccess : adminUsersT.readOnly, warn: !canManageUserAccess },
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
                <span className="micro-label">{i18n.admin.nav.items.users}</span>
                <h2>{adminUsersT.unavailableTitle}</h2>
                <p>{adminUsersT.unavailableDesc}</p>
              </section>
            )}
          </>
        ) : // ── Operations: Logs ──────────────────────────────────────────────
        section.id === 'logs' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminLogs?.items.length ?? 0} ${(adminLogs?.items.length ?? 0) === 1 ? adminT.eventsSuffixSingular : adminT.eventsSuffixPlural}` },
                { label: adminLogs?.filters.category ?? adminT.allCategories },
              ]}
            />
            {adminLogs ? (
              <LogsExplorerClient
                canExportLogs={adminLogs.exportDecision.allowed}
                isConnectedSession={isConnectedSession}
                snapshot={adminLogs}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">{i18n.admin.nav.items.logs}</span>
                <h2>{adminT.logsUnavailableTitle}</h2>
                <p>{adminT.logsUnavailableDesc}</p>
              </section>
            )}
          </>
        ) : // ── Control Plane: Extension Control ──────────────────────────────
        section.id === 'extension-control' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${featureFlags?.flags.length ?? 0} ${(featureFlags?.flags.length ?? 0) === 1 ? adminT.flagsSuffixSingular : adminT.flagsSuffixPlural}` },
                { label: `${remoteConfigState?.activeLayers.length ?? 0} ${(remoteConfigState?.activeLayers.length ?? 0) === 1 ? adminT.layersSuffixSingular : adminT.layersSuffixPlural}` },
                { label: compatibilityRules?.publishDecision.allowed ? adminT.publishAccess : adminT.publishBlocked, warn: !compatibilityRules?.publishDecision.allowed },
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {compatibilityRules ? (
              <ExtensionControlAdminClient
                compatibilityRules={compatibilityRules}
                featureFlags={featureFlags}
                remoteConfig={remoteConfigState}
                isConnectedSession={isConnectedSession}
                canEditFlags={canEditFeatureFlags}
              />
            ) : (
              <section className="empty-state">
                <span className="micro-label">{i18n.admin.nav.items.extensionControl}</span>
                <h2>{adminT.controlPlaneUnavailableTitle}</h2>
                <p>{adminT.controlPlaneUnavailableDesc}</p>
              </section>
            )}
          </>
        ) : // ── Control Plane: AI Routing ─────────────────────────────────────
        section.id === 'ai-routing' ? (
          <>
            <SectionHeader
              groupLabel={section.groupLabel}
              title={section.title}
              tags={[
                { label: `${adminProviderGovernance?.items.length ?? 0} ${(adminProviderGovernance?.items.length ?? 0) === 1 ? adminT.credentialsSuffixSingular : adminT.credentialsSuffixPlural}` },
                { label: `${adminProviderGovernance?.providerBreakdown.filter((e) => e.totalCredentials > 0).length ?? 0} ${(adminProviderGovernance?.providerBreakdown.filter((e) => e.totalCredentials > 0).length ?? 0) === 1 ? adminT.activeProvidersSuffixSingular : adminT.activeProvidersSuffixPlural}` },
                ...(adminProviderGovernance?.aiAccessPolicy.mode ? [{ label: `${adminT.policy}: ${adminProviderGovernance.aiAccessPolicy.mode}` }] : []),
              ]}
            />
            <SectionGroupLinks current={section} visibleSections={visibleSections} />
            {adminProviderGovernance ? (
              <AdminAiProvidersClient governance={adminProviderGovernance} isConnectedSession={isConnectedSession} />
            ) : (
              <section className="empty-state">
                <span className="micro-label">{i18n.admin.nav.items.aiRouting}</span>
                <h2>{adminT.providerUnavailableTitle}</h2>
                <p>{adminT.providerUnavailableDesc}</p>
              </section>
            )}
          </>
        ) : // ── Control Plane: Settings ───────────────────────────────────────
        section.id === 'settings' ? (
          <AdminSettingsClient
            isConnectedSession={isConnectedSession}
            sessionDisplayName={session.user.displayName ?? null}
            sessionEmail={session.user.email}
            userProfile={userProfile}
          />
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
          <span className="micro-label">{adminT.accessRestricted}</span>
          <h2>{adminT.noPermissionSection}</h2>
          <p>{adminT.missingSectionPermission}</p>
          <a className="btn-ghost" href="/admin">{adminT.backToAdmin}</a>
        </section>
      )}
    </SiteShell>
  );
}
