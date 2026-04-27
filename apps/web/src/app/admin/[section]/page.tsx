import { redirect } from 'next/navigation';
import { buildAccessContext } from '@quizmind/auth';
import { hasPermission } from '@quizmind/permissions';
import {
  type AdminLogFilters,
} from '@quizmind/contracts';
import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { isAdminSession } from '../../../lib/admin-guard';
import {
  getAdminProviderGovernance,
  getCompatibilityRules,
  getFeatureFlags,
  getRemoteConfigState,
  getUserProfile,
  getSession,
  resolvePersona,
} from '../../../lib/api';
import { ServerPrefsSync } from '../../../lib/preferences';
import { getExchangeRates } from '../../../lib/exchange-rates';
import { en } from '../../../lib/i18n/en';
import { ru } from '../../../lib/i18n/ru';
import type { Translations } from '../../../lib/i18n/en';
import { getVisibleAdminSections, buildVisibleAdminNavGroups } from '../../../features/navigation/visibility';
import { type AdminSection } from '../../../features/admin/sections';
import { AdminAiProvidersClient } from './admin-ai-providers-client';
import { ExtensionControlAdminClient } from './extension-control-admin-client';
import { UsersDirectoryClient } from './users-directory-client';
import { LogsExplorerClient } from './logs-explorer-client';
import { AdminSettingsClient } from './admin-settings-client';

type AdminI18n = Translations['admin'];

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
  getSectionLabel,
  groupLabel,
}: {
  current: AdminSection;
  visibleSections: AdminSection[];
  getSectionLabel: (section: AdminSection) => string;
  groupLabel: string;
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
        {groupLabel}:
      </span>
      {peers.map((peer) => (
        <Link
          key={peer.id}
          href={peer.href}
          className="btn-ghost"
          style={{ fontSize: '0.78rem', padding: '3px 10px' }}
        >
          {getSectionLabel(peer)}
        </Link>
      ))}
    </div>
  );
}

function getLocalizedSectionTitle(section: AdminSection, adminI18n: AdminI18n): string {
  switch (section.id) {
    case 'users': return adminI18n.nav.items.users;
    case 'logs': return adminI18n.nav.items.logs;
    case 'extension-control': return adminI18n.nav.items.extensionControl;
    case 'ai-routing': return adminI18n.nav.items.aiRouting;
    case 'settings': return adminI18n.nav.items.settings;
    default: return section.title;
  }
}

function getLocalizedGroupLabel(section: AdminSection, adminI18n: AdminI18n): string {
  switch (section.group) {
    case 'people': return adminI18n.nav.groups.people;
    case 'operations': return adminI18n.nav.groups.operations;
    case 'control-plane': return adminI18n.nav.groups.controlPlane;
    case 'preferences': return adminI18n.nav.groups.preferences;
    default: return section.groupLabel;
  }
}

function getLocalizedSectionDescription(section: AdminSection, adminI18n: AdminI18n): string {
  switch (section.id) {
    case 'users': return adminI18n.nav.descriptions.users;
    case 'logs': return adminI18n.nav.descriptions.logs;
    case 'extension-control': return adminI18n.nav.descriptions.extensionControl;
    case 'ai-routing': return adminI18n.nav.descriptions.aiRouting;
    case 'settings': return adminI18n.nav.descriptions.settings;
    default: return section.description;
  }
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
    cursor: readSearchParam(resolvedSearchParams, 'logCursor'),
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
    users:               {},
    logs:                {},
    'extension-control': { compatibility: true, flags: true, remoteConfig: true },
    'ai-routing':        { aiRouting: true },
  };
  const needs: LoaderNeeds = SECTION_NEEDS[sec] ?? {};

  const [
    featureFlags,
    adminProviderGovernance,
    compatibilityRules,
    remoteConfigState,
    exchangeRates,
  ] = await Promise.all([
    needs.flags ? getFeatureFlags(persona, accessToken) : Promise.resolve(null),
    needs.aiRouting ? getAdminProviderGovernance(accessToken) : Promise.resolve(null),
    needs.compatibility ? getCompatibilityRules(persona, accessToken) : Promise.resolve(null),
    needs.remoteConfig ? getRemoteConfigState(persona, undefined, accessToken) : Promise.resolve(null),
    getExchangeRates(),
  ]);

  const isConnectedSession = session?.personaKey === 'connected-user';
  const canEditFeatureFlags = Boolean(isConnectedSession && featureFlags?.writeDecision.allowed);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const permissions = session.permissions as Parameters<typeof hasPermission>[0];
  const canManageUserAccess = Boolean(isConnectedSession && hasPermission(permissions, 'users:update'));
  const canReadLogs = hasPermission(permissions, 'audit_logs:read');
  const canExportLogs = hasPermission(permissions, 'audit_logs:export');
  const context = session ? buildAccessContext(session.principal) : null;
  const visibleSections = context ? getVisibleAdminSections(context) : [];
  const visibleNavGroups = context ? buildVisibleAdminNavGroups(context) : [];
  const section = visibleSections.find((item) => item.href.endsWith(`/${sec}`));
  const resolvedSectionTitle = section ? getLocalizedSectionTitle(section, i18n.admin) : sec;
  const resolvedGroupLabel = section ? getLocalizedGroupLabel(section, i18n.admin) : adminT.adminLabel;
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
      title={sec === 'settings' ? adminT.settingsTitle : resolvedSectionTitle}
      userDisplayName={session?.user.displayName ?? undefined}
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      {session ? (
        <ServerPrefsSync serverPrefs={userProfile?.uiPreferences ?? null} />
      ) : null}
      {section && session ? (
        // ── People: Users ─────────────────────────────────────────────────
        section.id === 'users' ? (
          <>
            <SectionHeader
              groupLabel={resolvedGroupLabel}
              title={resolvedSectionTitle}
              tags={[
                { label: `— ${adminT.usersSuffixPlural}` },
                { label: canManageUserAccess ? adminUsersT.writeAccess : adminUsersT.readOnly, warn: !canManageUserAccess },
              ]}
            />
            <UsersDirectoryClient
              canManageUserAccess={canManageUserAccess}
              currentUserId={session.user.id}
              isConnectedSession={isConnectedSession}
              initialFilters={{
                query: readSearchParam(resolvedSearchParams, 'userQuery'),
                role: readSearchParam(resolvedSearchParams, 'userRole') ?? 'all',
                banned: readSearchParam(resolvedSearchParams, 'userBanned') ?? 'all',
                verified: readSearchParam(resolvedSearchParams, 'userVerified') ?? 'all',
                sort: readSearchParam(resolvedSearchParams, 'userSort') ?? 'created-desc',
                limit: readIntegerSearchParam(resolvedSearchParams, 'userLimit') ?? 25,
              }}
            />
          </>
        ) : // ── Operations: Logs ──────────────────────────────────────────────
        section.id === 'logs' ? (
          <>
            <SectionHeader
              groupLabel={resolvedGroupLabel}
              title={resolvedSectionTitle}
              tags={[
                { label: canReadLogs ? adminT.logsVisible : adminT.logsHidden, warn: !canReadLogs },
                { label: (adminLogFilters.category ?? adminT.allCategories) },
              ]}
            />
            <LogsExplorerClient
              canExportLogs={canExportLogs}
              exchangeRates={exchangeRates}
              isConnectedSession={isConnectedSession}
              initialFilters={{
                stream: adminLogFilters.stream ?? 'all',
                severity: adminLogFilters.severity ?? 'all',
                search: adminLogFilters.search,
                limit: adminLogFilters.limit ?? 25,
                category: adminLogFilters.category,
                source: adminLogFilters.source,
                status: adminLogFilters.status,
                eventType: adminLogFilters.eventType,
                from: adminLogFilters.from,
                to: adminLogFilters.to,
                page: adminLogFilters.page ?? 1,
                cursor: adminLogFilters.cursor,
              }}
            />
          </>
        ) : // ── Control Plane: Extension Control ──────────────────────────────
        section.id === 'extension-control' ? (
          <>
            <SectionHeader
              groupLabel={resolvedGroupLabel}
              title={resolvedSectionTitle}
              tags={[
                { label: `${featureFlags?.flags.length ?? 0} ${(featureFlags?.flags.length ?? 0) === 1 ? adminT.flagsSuffixSingular : adminT.flagsSuffixPlural}` },
                { label: `${remoteConfigState?.activeLayers.length ?? 0} ${(remoteConfigState?.activeLayers.length ?? 0) === 1 ? adminT.layersSuffixSingular : adminT.layersSuffixPlural}` },
                { label: compatibilityRules?.publishDecision.allowed ? adminT.publishAccess : adminT.publishBlocked, warn: !compatibilityRules?.publishDecision.allowed },
              ]}
            />
            <SectionGroupLinks
              current={section}
              visibleSections={visibleSections}
              getSectionLabel={(peer) => getLocalizedSectionTitle(peer, i18n.admin)}
              groupLabel={resolvedGroupLabel}
            />
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
              groupLabel={resolvedGroupLabel}
              title={resolvedSectionTitle}
              tags={[
                { label: `${adminProviderGovernance?.items.length ?? 0} ${(adminProviderGovernance?.items.length ?? 0) === 1 ? adminT.credentialsSuffixSingular : adminT.credentialsSuffixPlural}` },
                { label: `${adminProviderGovernance?.providerBreakdown.filter((e) => e.totalCredentials > 0).length ?? 0} ${(adminProviderGovernance?.providerBreakdown.filter((e) => e.totalCredentials > 0).length ?? 0) === 1 ? adminT.activeProvidersSuffixSingular : adminT.activeProvidersSuffixPlural}` },
                ...(adminProviderGovernance?.aiAccessPolicy.mode ? [{ label: `${adminT.policy}: ${adminProviderGovernance.aiAccessPolicy.mode}` }] : []),
              ]}
            />
            <SectionGroupLinks
              current={section}
              visibleSections={visibleSections}
              getSectionLabel={(peer) => getLocalizedSectionTitle(peer, i18n.admin)}
              groupLabel={resolvedGroupLabel}
            />
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
            <span className="micro-label">{resolvedGroupLabel}</span>
            <h2>{resolvedSectionTitle}</h2>
            <p>{getLocalizedSectionDescription(section, i18n.admin)}</p>
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
