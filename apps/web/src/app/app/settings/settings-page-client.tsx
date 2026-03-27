'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';

import {
  type AuthSessionsSnapshot,
  type ProviderCatalogSnapshot,
  type ProviderCredentialInventorySnapshot,
  type SessionSnapshot,
  type UserProfileSnapshot,
  type WorkspaceSubscriptionSnapshot,
} from '../../../lib/api';
import { type DashboardSection } from '../../../features/dashboard/sections';
import { formatUtcDateTime } from '../../../lib/datetime';
import { AiAccessClient } from './ai-access-client';

interface SettingsPageClientProps {
  authSessions: AuthSessionsSnapshot | null;
  isConnectedSession: boolean;
  providerCatalog: ProviderCatalogSnapshot | null;
  providerCredentialInventory: ProviderCredentialInventorySnapshot | null;
  session: SessionSnapshot;
  subscription: WorkspaceSubscriptionSnapshot | null;
  userProfile: UserProfileSnapshot | null;
  visibleSections: DashboardSection[];
}

interface LogoutAllRouteResponse {
  ok: boolean;
  data?: {
    revoked: boolean;
    revokedCount: number;
  };
  error?: {
    message?: string;
  };
}

interface UserProfileRouteResponse {
  ok: boolean;
  data?: UserProfileSnapshot;
  error?: {
    message?: string;
  };
}

function normalizeProfileInput(value: string): string | null {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export function SettingsPageClient({
  authSessions,
  isConnectedSession,
  providerCatalog,
  providerCredentialInventory,
  session,
  subscription,
  userProfile,
  visibleSections,
}: SettingsPageClientProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<UserProfileSnapshot | null>(userProfile);
  const [profileDraft, setProfileDraft] = useState({
    displayName: userProfile?.displayName ?? session.user.displayName ?? '',
    avatarUrl: userProfile?.avatarUrl ?? '',
    locale: userProfile?.locale ?? '',
    timezone: userProfile?.timezone ?? '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [sessionItems, setSessionItems] = useState(authSessions?.items ?? []);
  const [isRevokingEverywhere, setIsRevokingEverywhere] = useState(false);
  const [, startNavigation] = useTransition();

  const primaryWorkspace = session.workspaces[0] ?? null;
  const currentSubscription = subscription?.summary ?? null;
  const currentSessionCount = sessionItems.length;
  const currentSession = sessionItems.find((item) => item.current) ?? null;
  const isVerified = Boolean(session.user.emailVerifiedAt);
  const currentDisplayName = profileState?.displayName || session.user.displayName || 'Connected account';
  const currentEmail = profileState?.email ?? session.user.email;

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!isConnectedSession) {
      setStatusMessage(null);
      setErrorMessage('Connected session required to update profile settings.');
      return;
    }

    setStatusMessage('Saving profile settings...');
    setIsSavingProfile(true);

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          displayName: normalizeProfileInput(profileDraft.displayName),
          avatarUrl: normalizeProfileInput(profileDraft.avatarUrl),
          locale: normalizeProfileInput(profileDraft.locale),
          timezone: normalizeProfileInput(profileDraft.timezone),
        }),
      });
      const payload = (await response.json().catch(() => null)) as UserProfileRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to update profile settings right now.');
        setIsSavingProfile(false);
        return;
      }

      setProfileState(payload.data);
      setProfileDraft({
        displayName: payload.data.displayName ?? '',
        avatarUrl: payload.data.avatarUrl ?? '',
        locale: payload.data.locale ?? '',
        timezone: payload.data.timezone ?? '',
      });
      setStatusMessage('Profile settings updated.');
      setIsSavingProfile(false);
    } catch {
      setStatusMessage(null);
      setErrorMessage('Unable to reach the profile settings route right now.');
      setIsSavingProfile(false);
    }
  }

  async function handleLogoutAll() {
    setErrorMessage(null);
    setStatusMessage('Ending all active sessions and clearing this browser...');
    setIsRevokingEverywhere(true);

    try {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as LogoutAllRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.revoked) {
        setIsRevokingEverywhere(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to revoke active sessions right now.');
        return;
      }

      setSessionItems([]);
      startNavigation(() => {
        router.push('/auth/login?next=/app/settings');
        router.refresh();
      });
    } catch {
      setIsRevokingEverywhere(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the logout-all route right now.');
    }
  }

  return (
    <>
      {statusMessage ? <section className="billing-banner billing-banner-info">{statusMessage}</section> : null}
      {errorMessage ? <section className="billing-banner billing-banner-error">{errorMessage}</section> : null}

      <section className="settings-metrics">
        <article className="stat-card">
          <span className="micro-label">Email status</span>
          <p className="stat-value">{isVerified ? 'Verified' : 'Pending'}</p>
          <p className="metric-copy">
            {isVerified ? formatUtcDateTime(session.user.emailVerifiedAt) : 'Verification completes inbox ownership.'}
          </p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Active sessions</span>
          <p className="stat-value">{currentSessionCount}</p>
          <p className="metric-copy">{isConnectedSession ? 'Live Prisma-backed session inventory.' : 'Persona preview only.'}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Workspaces</span>
          <p className="stat-value">{session.workspaces.length}</p>
          <p className="metric-copy">{primaryWorkspace ? primaryWorkspace.name : 'No workspace membership yet.'}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Permissions</span>
          <p className="stat-value">{session.permissions.length}</p>
          <p className="metric-copy">Resolved from the same backend policy graph as the dashboard.</p>
        </article>
      </section>

      <section className="settings-layout">
        <article className="panel settings-card">
          <span className="micro-label">Account</span>
          <div className="settings-card-copy">
            <h2>{currentDisplayName}</h2>
            <p>{currentEmail}</p>
          </div>
          <div className="tag-row">
            <span className={isVerified ? 'tag' : 'tag warn'}>{isVerified ? 'email verified' : 'verification pending'}</span>
            {session.principal.systemRoles.map((role) => (
              <span className="tag" key={role}>
                {role}
              </span>
            ))}
            {session.principal.systemRoles.length === 0 ? <span className="tag warn">workspace-only account</span> : null}
          </div>
          <form className="settings-profile-form" onSubmit={(event) => void handleProfileSave(event)}>
            <div className="settings-profile-grid">
              <label className="settings-profile-field">
                <span>Display name</span>
                <input
                  name="displayName"
                  onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))}
                  placeholder="Workspace owner"
                  type="text"
                  value={profileDraft.displayName}
                />
              </label>
              <label className="settings-profile-field">
                <span>Avatar URL</span>
                <input
                  name="avatarUrl"
                  onChange={(event) => setProfileDraft((current) => ({ ...current, avatarUrl: event.target.value }))}
                  placeholder="https://cdn.quizmind.dev/avatar.png"
                  type="url"
                  value={profileDraft.avatarUrl}
                />
              </label>
              <label className="settings-profile-field">
                <span>Locale</span>
                <input
                  name="locale"
                  onChange={(event) => setProfileDraft((current) => ({ ...current, locale: event.target.value }))}
                  placeholder="en-US"
                  type="text"
                  value={profileDraft.locale}
                />
              </label>
              <label className="settings-profile-field">
                <span>Timezone</span>
                <input
                  name="timezone"
                  onChange={(event) => setProfileDraft((current) => ({ ...current, timezone: event.target.value }))}
                  placeholder="UTC"
                  type="text"
                  value={profileDraft.timezone}
                />
              </label>
            </div>
            <div className="settings-inline-actions">
              <button className="btn-primary" disabled={!isConnectedSession || isSavingProfile} type="submit">
                {isSavingProfile ? 'Saving profile...' : 'Save profile'}
              </button>
              <span className="list-muted">
                {isConnectedSession
                  ? 'Leave optional fields blank to clear them.'
                  : 'Connected session required for profile updates.'}
              </span>
            </div>
          </form>
          <div className="mini-list">
            <div className="list-item">
              <strong>Current session persona</strong>
              <p>{session.personaLabel}</p>
            </div>
            <div className="list-item">
              <strong>Locale and timezone</strong>
              <p>
                {(profileState?.locale ?? 'not set')} | {(profileState?.timezone ?? 'not set')}
              </p>
            </div>
            <div className="list-item">
              <strong>Workspace memberships</strong>
              <p>{session.workspaces.map((workspace) => `${workspace.name} (${workspace.role})`).join(', ') || 'None yet'}</p>
            </div>
            {!isVerified ? (
              <div className="list-item">
                <strong>Verification reminder</strong>
                <p>Unverified accounts receive a fresh verification email on sign-in while the inbox is still pending.</p>
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel settings-card">
          <span className="micro-label">Security</span>
          <div className="settings-card-copy">
            <h2>Session controls</h2>
            <p>Use password recovery or revoke every active session if a browser was lost, shared, or left behind.</p>
          </div>
          <div className="settings-inline-actions">
            <button
              className="btn-primary"
              disabled={!isConnectedSession || isRevokingEverywhere}
              onClick={() => void handleLogoutAll()}
              type="button"
            >
              {isRevokingEverywhere ? 'Revoking sessions...' : 'Sign out everywhere'}
            </button>
            <Link className="btn-ghost" href="/auth/forgot-password">
              Reset password
            </Link>
          </div>
          <div className="mini-list">
            <div className="list-item">
              <strong>Current browser</strong>
              <p>
                {currentSession
                  ? `${currentSession.deviceName || currentSession.browser || 'Unnamed session'} | expires ${formatUtcDateTime(currentSession.expiresAt)}`
                  : 'Current session details are only available in connected mode.'}
              </p>
            </div>
            <div className="list-item">
              <strong>Security posture</strong>
              <p>
                {isConnectedSession
                  ? 'Connected mode is active, so session inventory and logout-all are backed by real session rows.'
                  : 'Persona preview is read-only. Sign in with a connected account to manage live sessions.'}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel settings-card">
          <span className="micro-label">Active sessions</span>
          <h2>Browser inventory</h2>
          {sessionItems.length ? (
            <div className="settings-session-list">
              {sessionItems.map((item) => (
                <div className="settings-session-row" key={item.id}>
                  <div>
                    <strong>{item.deviceName || item.browser || 'Unnamed session'}</strong>
                    <p className="list-muted">
                      {item.browser || 'unknown browser'} | {item.ipAddress || 'unknown ip'}
                    </p>
                    <p className="list-muted">
                      Created {formatUtcDateTime(item.createdAt)} | Expires {formatUtcDateTime(item.expiresAt)}
                    </p>
                  </div>
                  <div className="billing-history-meta">
                    {item.current ? <span className="tag">current</span> : null}
                    <span className="tag">{item.id.slice(0, 10)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="micro-label">No live inventory</span>
              <h2>Session listing is unavailable in this context.</h2>
              <p>Connected mode shows browser/device rows here. Persona preview keeps this panel read-only.</p>
            </div>
          )}
        </article>

        <article className="panel settings-card">
          <span className="micro-label">Workspace</span>
          <h2>{primaryWorkspace?.name ?? 'No workspace selected'}</h2>
          <div className="mini-list">
            <div className="list-item">
              <strong>Current role</strong>
              <p>{primaryWorkspace?.role ?? 'No role available'}</p>
            </div>
            <div className="list-item">
              <strong>Plan state</strong>
              <p>
                {currentSubscription
                  ? `${currentSubscription.planCode} | ${currentSubscription.status} | ${currentSubscription.billingInterval}`
                  : 'Subscription snapshot not available.'}
              </p>
            </div>
            <div className="list-item">
              <strong>Visible dashboard routes</strong>
              <p>{visibleSections.map((section) => section.title).join(', ') || 'None resolved for this context.'}</p>
            </div>
          </div>
          <div className="settings-inline-actions">
            <Link className="btn-ghost" href="/app">
              Overview
            </Link>
            <Link className="btn-ghost" href="/app/billing">
              Billing
            </Link>
            <Link className="btn-ghost" href="/app/usage">
              Usage
            </Link>
            <Link className="btn-ghost" href="/app/history">
              History
            </Link>
          </div>
        </article>
      </section>

      <AiAccessClient
        currentWorkspaceId={primaryWorkspace?.id}
        isConnectedSession={isConnectedSession}
        providerCatalog={providerCatalog}
        providerCredentialInventory={providerCredentialInventory}
        workspaceOptions={session.workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          role: workspace.role,
        }))}
      />
    </>
  );
}
