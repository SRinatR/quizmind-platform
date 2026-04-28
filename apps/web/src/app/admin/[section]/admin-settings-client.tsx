'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';

import { useShellProfile } from '../../../lib/shell-profile-context';
import { usePreferences } from '../../../lib/preferences';
import { type UserProfileSnapshot } from '../../../lib/api';
import { AppearanceSettingsPanel } from '../../components/settings/appearance-settings-panel';
import { type PlatformRetentionPolicySnapshot, type PlatformRetentionPolicyUpdateRequest } from '@quizmind/contracts';

const PRESET_AVATARS = ['🧠', '🚀', '🦊', '🐼', '🐙', '🧑‍💻', '🎯', '⚡️', '🛰️', '🧩'];

type SettingsTab = 'profile' | 'appearance' | 'retention';

interface UserProfileRouteResponse {
  ok: boolean;
  data?: UserProfileSnapshot;
  error?: { message?: string };
}

interface RetentionRouteResponse {
  ok: boolean;
  data?: PlatformRetentionPolicySnapshot;
  error?: { message?: string };
}

const retentionFieldConfig = {
  aiHistoryContentDays: { min: 1, max: 365, step: 1 },
  aiHistoryAttachmentDays: { min: 1, max: 365, step: 1 },
  adminLogActivityDays: { min: 1, max: 3650, step: 1 },
  adminLogDomainDays: { min: 1, max: 3650, step: 1 },
  adminLogSystemDays: { min: 1, max: 3650, step: 1 },
  adminLogAuditDays: { min: 30, max: 3650, step: 1 },
  adminLogSecurityDays: { min: 30, max: 3650, step: 1 },
  adminLogAdminDays: { min: 30, max: 3650, step: 1 },
} as const;

interface AdminSettingsClientProps {
  isConnectedSession: boolean;
  sessionEmail: string;
  sessionDisplayName?: string | null;
  userProfile: UserProfileSnapshot | null;
}

function makeEmojiAvatarUrl(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="170">${emoji}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function isEmojiAvatarUrl(url: string): boolean {
  return url.startsWith('data:image/svg+xml');
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

function normalizeInput(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resizeAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('file_read_failed'));
    fr.onload = () => {
      const src = typeof fr.result === 'string' ? fr.result : null;
      if (!src) return reject(new Error('file_read_failed'));

      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas_failed'));

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);

        const scale = Math.max(size / img.width, size / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (size - drawW) / 2;
        const dy = (size - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);

        let out = canvas.toDataURL('image/jpeg', 0.74);
        if (out.length > 120_000) out = canvas.toDataURL('image/jpeg', 0.64);
        resolve(out);
      };
      img.onerror = () => reject(new Error('image_decode_failed'));
      img.src = src;
    };
    fr.readAsDataURL(file);
  });
}

export function AdminSettingsClient({
  isConnectedSession,
  sessionEmail,
  sessionDisplayName,
  userProfile,
}: AdminSettingsClientProps) {
  const router = useRouter();
  const { t } = usePreferences();
  const { updateShellProfile } = useShellProfile();
  const adminT = t.admin;

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [profileState, setProfileState] = useState<UserProfileSnapshot | null>(userProfile);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(
    userProfile?.displayName ?? sessionDisplayName ?? '',
  );
  const [avatarDraft, setAvatarDraft] = useState(userProfile?.avatarUrl ?? '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileAvatarError, setProfileAvatarError] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [retentionState, setRetentionState] = useState<PlatformRetentionPolicySnapshot | null>(null);
  const [retentionDraft, setRetentionDraft] = useState<PlatformRetentionPolicyUpdateRequest | null>(null);
  const [retentionStatus, setRetentionStatus] = useState<string | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [isSavingRetention, setIsSavingRetention] = useState(false);

  useEffect(() => {
    setProfileState(userProfile);
    if (!isEditingProfile) {
      setDisplayNameDraft(userProfile?.displayName ?? sessionDisplayName ?? '');
      setAvatarDraft(userProfile?.avatarUrl ?? '');
    }
  }, [isEditingProfile, sessionDisplayName, userProfile]);

  useEffect(() => {
    setProfileAvatarError(false);
  }, [profileState?.avatarUrl]);

  const currentDisplayName = profileState?.displayName ?? sessionDisplayName ?? adminT.settings.yourProfile;
  const currentEmail = profileState?.email ?? sessionEmail;
  const avatarUrl = profileState?.avatarUrl;
  const initials = getInitials(currentDisplayName);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError(adminT.settings.imageFileError);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setProfileError(adminT.settings.imageLargeError);
      return;
    }

    try {
      const dataUrl = await resizeAvatarFile(file);
      setAvatarDraft(dataUrl);
      setProfileError(null);
    } catch {
      setProfileError(adminT.settings.imageProcessError);
    }
  }

  async function handleProfileSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isConnectedSession) {
      setProfileError(t.settings.errors.notConnected);
      return;
    }

    setProfileError(null);
    setProfileStatus(t.settings.account.saving);
    setIsSavingProfile(true);

    try {
      let resolvedAvatarUrl: string | null = normalizeInput(avatarDraft);
      if (
        resolvedAvatarUrl !== null &&
        resolvedAvatarUrl.startsWith('data:image/') &&
        !resolvedAvatarUrl.startsWith('data:image/svg+xml')
      ) {
        const uploadRes = await fetch('/bff/user/avatar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dataUrl: resolvedAvatarUrl }),
        });
        const uploadPayload = (await uploadRes.json().catch(() => null)) as
          | { ok: true; url: string }
          | { ok: false; error: { message?: string } }
          | null;
        if (!uploadRes.ok || !uploadPayload?.ok) {
          setProfileStatus(null);
          setProfileError(
            (uploadPayload as { ok: false; error: { message?: string } } | null)?.error?.message ??
            t.settings.errors.unableToSave,
          );
          setIsSavingProfile(false);
          return;
        }
        resolvedAvatarUrl = (uploadPayload as { ok: true; url: string }).url;
      }

      const res = await fetch('/bff/user/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: normalizeInput(displayNameDraft),
          avatarUrl: resolvedAvatarUrl,
        }),
      });
      const payload = (await res.json().catch(() => null)) as UserProfileRouteResponse | null;

      if (!res.ok || !payload?.ok || !payload.data) {
        setProfileStatus(null);
        setProfileError(payload?.error?.message ?? t.settings.errors.unableToUpdate);
        setIsSavingProfile(false);
        return;
      }

      setProfileState(payload.data);
      setDisplayNameDraft(payload.data.displayName ?? '');
      setAvatarDraft(payload.data.avatarUrl ?? '');
      updateShellProfile(payload.data.displayName, payload.data.avatarUrl);
      setProfileStatus(t.settings.account.savedMessage);
      setIsEditingProfile(false);
      setIsSavingProfile(false);
      router.refresh();
    } catch {
      setProfileStatus(null);
      setProfileError(t.settings.errors.unableToSave);
      setIsSavingProfile(false);
    }
  }

  function handleCancelEdit() {
    setIsEditingProfile(false);
    setDisplayNameDraft(profileState?.displayName ?? sessionDisplayName ?? '');
    setAvatarDraft(profileState?.avatarUrl ?? '');
    setProfileError(null);
    setProfileStatus(null);
  }

  async function handleRefresh() {
    setProfileStatus(null);
    setProfileError(null);
    try {
      const res = await fetch('/bff/user/profile', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as UserProfileRouteResponse | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? 'refresh_failed');
      }
      setProfileState(payload.data);
      setDisplayNameDraft(payload.data.displayName ?? '');
      setAvatarDraft(payload.data.avatarUrl ?? '');
      updateShellProfile(payload.data.displayName, payload.data.avatarUrl);
      setProfileStatus(adminT.settings.updatedJustNow);
    } catch {
      setProfileError(adminT.settings.refreshFailed);
    }
  }

  async function loadRetentionPolicy() {
    const res = await fetch('/bff/admin/settings/retention', { cache: 'no-store' });
    const payload = (await res.json().catch(() => null)) as RetentionRouteResponse | null;
    if (!res.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error?.message ?? adminT.settings.retention.loadFailed);
    }
    setRetentionState(payload.data);
    setRetentionDraft(payload.data.policy);
  }

  useEffect(() => {
    if (activeTab !== 'retention' || retentionState) return;
    void loadRetentionPolicy().catch(() => setRetentionError(adminT.settings.retention.loadFailed));
  }, [activeTab, retentionState, adminT.settings.retention.loadFailed]);

  async function handleRetentionSave() {
    if (!retentionDraft) return;
    for (const [field, config] of Object.entries(retentionFieldConfig) as Array<[keyof typeof retentionFieldConfig, { min: number; max: number; step: number }]>) {
      if (!(field in retentionDraft)) continue;
      const value = retentionDraft[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < config.min || value > config.max) {
        setRetentionError(adminT.settings.retention.validationDays);
        return;
      }
    }
    setRetentionError(null);
    setRetentionStatus(t.settings.account.saving);
    setIsSavingRetention(true);
    const res = await fetch('/bff/admin/settings/retention', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(retentionDraft),
    });
    const payload = (await res.json().catch(() => null)) as RetentionRouteResponse | null;
    if (!res.ok || !payload?.ok || !payload.data) {
      setRetentionStatus(null);
      setRetentionError(payload?.error?.message ?? adminT.settings.retention.saveFailed);
      setIsSavingRetention(false);
      return;
    }
    setRetentionState(payload.data);
    setRetentionDraft(payload.data.policy);
    setRetentionStatus(t.settings.account.savedMessage);
    setIsSavingRetention(false);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleFileChange(e)}
        aria-hidden="true"
      />

      <nav className="settings-tabs" aria-label={adminT.settings.pageTitle}>
        <button
          type="button"
          className={`settings-tab${activeTab === 'profile' ? ' settings-tab--active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          {adminT.settings.yourProfile}
        </button>
        <button
          type="button"
          className={`settings-tab${activeTab === 'appearance' ? ' settings-tab--active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          {t.settings.tabs.appearance}
        </button>
        <button
          type="button"
          className={`settings-tab${activeTab === 'retention' ? ' settings-tab--active' : ''}`}
          onClick={() => setActiveTab('retention')}
        >
          {adminT.settings.retention.tabLabel}
        </button>
      </nav>

      {activeTab === 'profile' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{adminT.settings.yourProfile}</h3>
            <p className="settings-section__desc">{adminT.settings.profileDesc}</p>
          </div>

          <article className="panel settings-card">
            {profileStatus ? <div className="banner banner-info" style={{ marginBottom: '8px' }}>{profileStatus}</div> : null}
            {profileError ? <div className="banner banner-error" style={{ marginBottom: '8px' }}>{profileError}</div> : null}

            {isEditingProfile ? (
              <form className="settings-profile-form" onSubmit={(e) => void handleProfileSave(e)}>
                <div className="profile-avatar-editor">
                  <div className="profile-avatar-preview">
                    <div className="profile-avatar-preview__circle" aria-hidden="true">
                      {avatarDraft ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarDraft}
                          alt=""
                          className={isEmojiAvatarUrl(avatarDraft) ? 'profile-avatar-preview__emoji' : 'profile-avatar-preview__img'}
                          onError={() => setAvatarDraft('')}
                        />
                      ) : (
                        <span className="profile-avatar-preview__initials">{initials}</span>
                      )}
                    </div>
                    <div className="profile-avatar-upload-btn-wrap">
                      <button type="button" className="avatar-upload-btn" onClick={() => fileInputRef.current?.click()}>
                        {adminT.settings.uploadFromDevice}
                      </button>
                    </div>
                  </div>

                  <div className="profile-avatar-picker">
                    <span className="micro-label" style={{ marginBottom: '8px', display: 'block' }}>
                      {adminT.settings.pickAvatar}
                    </span>
                    <div className="avatar-emoji-grid">
                      {PRESET_AVATARS.map((emoji) => {
                        const emojiUrl = makeEmojiAvatarUrl(emoji);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            className={`avatar-emoji-btn${avatarDraft === emojiUrl ? ' avatar-emoji-btn--active' : ''}`}
                            onClick={() => setAvatarDraft(emojiUrl)}
                            aria-label={emoji}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: '16px' }}>
                  <label className="form-field">
                    <span className="form-field__label">{adminT.settings.displayName}</span>
                    <input
                      name="displayName"
                      placeholder={t.settings.account.displayNamePlaceholder}
                      type="text"
                      value={displayNameDraft}
                      onChange={(e) => setDisplayNameDraft(e.target.value)}
                    />
                  </label>
                </div>

                <div className="settings-inline-actions" style={{ marginTop: '12px' }}>
                  <button className="btn-primary" disabled={!isConnectedSession || isSavingProfile} type="submit">
                    {isSavingProfile ? t.settings.account.saving : t.common.save}
                  </button>
                  <button className="btn-ghost" type="button" onClick={handleCancelEdit}>
                    {t.common.cancel}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="profile-identity" style={{ marginTop: '4px' }}>
                  <div className="profile-avatar" aria-hidden="true">
                    {avatarUrl && !profileAvatarError ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className={isEmojiAvatarUrl(avatarUrl) ? 'profile-avatar__emoji' : 'profile-avatar__img'}
                        onError={() => setProfileAvatarError(true)}
                      />
                    ) : (
                      <span className="profile-avatar__initials">{initials}</span>
                    )}
                  </div>
                  <div>
                    <h2 className="profile-name">{currentDisplayName}</h2>
                    <p className="profile-email">{currentEmail}</p>
                  </div>
                </div>
                <div className="link-row" style={{ marginTop: '16px' }}>
                  <button className="btn-ghost" type="button" onClick={() => setIsEditingProfile(true)}>
                    {adminT.settings.editProfile}
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => void handleRefresh()}>
                    {adminT.settings.refresh}
                  </button>
                </div>
              </>
            )}
          </article>
        </div>
      ) : null}

      {activeTab === 'appearance' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{t.settings.appearance.title}</h3>
            <p className="settings-section__desc">{t.settings.appearance.desc}</p>
          </div>

          <article className="panel settings-card">
            <AppearanceSettingsPanel isSignedIn={isConnectedSession} />
          </article>
        </div>
      ) : null}
      {activeTab === 'retention' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{adminT.settings.retention.title}</h3>
            <p className="settings-section__desc">{adminT.settings.retention.desc}</p>
          </div>
          <article className="panel settings-card">
            {retentionStatus ? <div className="banner banner-info" style={{ marginBottom: '8px' }}>{retentionStatus}</div> : null}
            {retentionError ? <div className="banner banner-error" style={{ marginBottom: '8px' }}>{retentionError}</div> : null}
            {retentionDraft ? (
              <>
                <div className="micro-label" style={{ marginBottom: '8px' }}>{adminT.settings.retention.aiSectionTitle}</div>
                <div className="form-grid">
                  {(['aiHistoryContentDays','aiHistoryAttachmentDays'] as const).map((field) => (
                    <label className="form-field" key={field}>
                      <span className="form-field__label">{adminT.settings.retention[field]}</span>
                      <input
                        type="number"
                        value={String(retentionDraft[field] ?? '')}
                        min={retentionFieldConfig[field].min}
                        max={retentionFieldConfig[field].max}
                        step={retentionFieldConfig[field].step}
                        onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), [field]: Number(e.target.value) }))}
                      />
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: '10px' }}>
                  <span className="form-field__label">{adminT.settings.retention.legacyAiRequestDays}</span>
                  <div>{retentionState?.policy.legacyAiRequestDays} {adminT.settings.retention.legacyReadOnly}</div>
                </div>
                <div className="micro-label" style={{ marginTop: '12px', marginBottom: '8px' }}>{adminT.settings.retention.adminLogsSectionTitle}</div>
                <div className="form-grid">
                  {(['adminLogActivityDays','adminLogDomainDays','adminLogSystemDays','adminLogAuditDays','adminLogSecurityDays','adminLogAdminDays'] as const).map((field) => (
                    <label className="form-field" key={field}>
                      <span className="form-field__label">{adminT.settings.retention[field]}</span>
                      <input
                        type="number"
                        value={String(retentionDraft[field] ?? '')}
                        min={retentionFieldConfig[field].min}
                        max={retentionFieldConfig[field].max}
                        step={retentionFieldConfig[field].step}
                        onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), [field]: Number(e.target.value) }))}
                      />
                    </label>
                  ))}
                  <label className="form-field">
                    <span className="form-field__label">{adminT.settings.retention.enableCleanup}</span>
                    <input type="checkbox" checked={Boolean(retentionDraft.adminLogRetentionEnabled)} onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), adminLogRetentionEnabled: e.target.checked }))} />
                  </label>
                  <label className="form-field">
                    <span className="form-field__label">{adminT.settings.retention.enableSensitiveCleanup}</span>
                    <input type="checkbox" checked={Boolean(retentionDraft.adminLogSensitiveRetentionEnabled)} onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), adminLogSensitiveRetentionEnabled: e.target.checked }))} />
                    <small>{adminT.settings.retention.sensitiveWarning}</small>
                  </label>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <div className="micro-label">{adminT.settings.retention.authSectionTitle}</div>
                  <p style={{ margin: '6px 0 0' }}>{adminT.settings.retention.authReadOnlyNote}</p>
                  <ul>
                    <li>{adminT.settings.retention.accessToken}: {retentionState?.policy.accessTokenMinutes}m</li>
                    <li>{adminT.settings.retention.refreshSession}: {retentionState?.policy.authRefreshSessionDays}d</li>
                    <li>{adminT.settings.retention.passwordReset}: {retentionState?.policy.passwordResetHours}h</li>
                    <li>{adminT.settings.retention.emailVerification}: {retentionState?.policy.emailVerificationHours}h</li>
                  </ul>
                </div>
              </>
            ) : null}
            <div className="settings-inline-actions" style={{ marginTop: '12px' }}>
              <button className="btn-primary" type="button" onClick={() => void handleRetentionSave()} disabled={isSavingRetention}>
                {isSavingRetention ? t.settings.account.saving : t.common.save}
              </button>
              <button className="btn-ghost" type="button" onClick={() => setRetentionDraft(retentionState?.policy ?? null)}>
                {t.common.cancel}
              </button>
              <button className="btn-ghost" type="button" onClick={() => setRetentionDraft({ aiHistoryContentDays: 7, aiHistoryAttachmentDays: 7, adminLogRetentionEnabled: false, adminLogActivityDays: 30, adminLogDomainDays: 30, adminLogSystemDays: 30, adminLogAuditDays: 365, adminLogSecurityDays: 365, adminLogAdminDays: 365, adminLogSensitiveRetentionEnabled: false })}>
                {adminT.settings.retention.resetDefaults}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}
