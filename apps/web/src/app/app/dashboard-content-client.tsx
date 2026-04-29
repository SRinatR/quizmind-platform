'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { type WalletBalanceSnapshot, type WalletTopUpCreateResult } from '@quizmind/contracts';

import type { SessionSnapshot, UserProfileSnapshot } from '../../lib/api';
import type { ExchangeRateSnapshot } from '../../lib/exchange-rates';
import { formatBalanceFromKopecks } from '../../lib/money';
import { usePreferences } from '../../lib/preferences';
import { useShellProfile } from '../../lib/shell-profile-context';
import { useAutoRefresh } from '../../lib/use-auto-refresh';

interface ProfilePageClientProps {
  canManageBilling: boolean;
  initialBalance: WalletBalanceSnapshot | null;
  isConnectedSession: boolean;
  session: SessionSnapshot;
  userProfile: UserProfileSnapshot | null;
  exchangeRates: ExchangeRateSnapshot | null;
}

interface UserProfileRouteResponse {
  ok: boolean;
  data?: UserProfileSnapshot;
  error?: { message?: string };
}

interface BillingRouteResponse<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

const PRESET_AMOUNTS_KOPECKS = [10_000, 30_000, 50_000, 100_000, 300_000] as const;

const PRESET_AVATARS = [
  '🎯', '🦊', '🐻', '🐼', '🦁', '🐸',
  '🦋', '⚡', '🚀', '🎨', '🧠', '🌈',
  '🏆', '🎭', '🌟', '🦄',
];

const AVATAR_SIZE = 256;

function makeEmojiAvatarUrl(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><text y="62" x="8" font-size="64">${emoji}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isEmojiAvatarUrl(url: string): boolean {
  return url.startsWith('data:image/svg+xml');
}

function resizeAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = Math.floor((img.naturalWidth - side) / 2);
      const sy = Math.floor((img.naturalHeight - side) / 2);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

function normalizeInput(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

declare global {
  interface Window {
    YooMoneyCheckoutWidget?: new (options: {
      confirmation_token: string;
      return_url: string;
      error_callback: (error: { error: string }) => void;
    }) => {
      render: (containerId: string) => Promise<void>;
      destroy: () => void;
    };
  }
}

export function ProfilePageClient({
  canManageBilling,
  initialBalance,
  isConnectedSession,
  session,
  userProfile,
  exchangeRates,
}: ProfilePageClientProps) {
  const router = useRouter();
  const { t, prefs } = usePreferences();
  const { updateShellProfile } = useShellProfile();
  const s = t.settings;
  const tb = t.billing;
  const tp = t.profile;

  // ── Profile state ──
  const [profileState, setProfileState] = useState<UserProfileSnapshot | null>(userProfile);
  const [profileAvatarError, setProfileAvatarError] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(
    userProfile?.displayName ?? session.user.displayName ?? '',
  );
  const [avatarDraft, setAvatarDraft] = useState(userProfile?.avatarUrl ?? '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [avatarTouched, setAvatarTouched] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Balance state ──
  const [balance, setBalance] = useState<WalletBalanceSnapshot | null>(initialBalance);
  const [showModal, setShowModal] = useState(false);
  const [selectedKopecks, setSelectedKopecks] = useState<number>(50_000);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [widgetToken, setWidgetToken] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const widgetRef = useRef<{ destroy: () => void } | null>(null);

  const effectiveKopecks = useCustom
    ? Math.round((parseFloat(customAmount.replace(',', '.')) || 0) * 100)
    : selectedKopecks;

  const customAmountValid =
    !useCustom ||
    (Number.isFinite(effectiveKopecks) && effectiveKopecks >= 1_000 && effectiveKopecks <= 100_000_000);

  const currentDisplayName =
    profileState?.displayName ?? session.user.displayName ?? tp.yourAccount;
  const currentEmail = profileState?.email ?? session.user.email;
  const avatarUrl = profileState?.avatarUrl ?? userProfile?.avatarUrl;
  const initials = currentDisplayName ? getInitials(currentDisplayName) : '?';

  useEffect(() => {
    setProfileState(userProfile);

    if (!isEditingProfile || !displayNameTouched) {
      setDisplayNameDraft(userProfile?.displayName ?? session.user.displayName ?? '');
    }

    if (!isEditingProfile || !avatarTouched) {
      setAvatarDraft(userProfile?.avatarUrl ?? '');
    }

    if (!isEditingProfile) {
      setDisplayNameTouched(false);
      setAvatarTouched(false);
    }
  }, [avatarTouched, displayNameTouched, isEditingProfile, session.user.displayName, userProfile]);

  useEffect(() => {
    setBalance(initialBalance);
  }, [initialBalance]);

  // ── YooKassa widget mount ──
  useEffect(() => {
    if (!widgetToken || !scriptLoaded) return;
    const container = 'profile-yookassa-widget';

    async function mountWidget() {
      if (!window.YooMoneyCheckoutWidget) {
        setBillingError(tb.widgetLoadError);
        return;
      }
      widgetRef.current?.destroy();
      const widget = new window.YooMoneyCheckoutWidget({
        confirmation_token: widgetToken!,
        return_url: window.location.href,
        error_callback: (err) => {
          if (err.error === 'token_expired') {
            setWidgetToken(null);
            setBillingError(tb.tokenExpired);
          } else {
            setBillingError(`${tb.widgetError} ${err.error}`);
          }
          setActiveAction(null);
        },
      });
      widgetRef.current = widget;
      try {
        await widget.render(container);
        setWidgetReady(true);
      } catch {
        setBillingError(tb.widgetRenderError);
        setActiveAction(null);
      }
    }

    void mountWidget();

    return () => {
      widgetRef.current?.destroy();
      widgetRef.current = null;
      setWidgetReady(false);
    };
  }, [widgetToken, scriptLoaded, tb]);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/bff/wallet/balance', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as BillingRouteResponse<WalletBalanceSnapshot> | null;
      if (res.ok && payload?.ok && payload.data) setBalance(payload.data);
    } catch {
      // non-critical
    }
  }, []);

  const refreshProfile = useCallback(async (signal: AbortSignal) => {
    const res = await fetch('/bff/user/profile', { cache: 'no-store', signal });
    const payload = (await res.json().catch(() => null)) as UserProfileRouteResponse | null;
    if (!res.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error?.message ?? tp.refreshFailed);
    }

    const nextProfile = payload.data;
    setProfileState(nextProfile);
    if (!isEditingProfile || !displayNameTouched) {
      setDisplayNameDraft(nextProfile.displayName ?? '');
    }
    if (!isEditingProfile || !avatarTouched) {
      setAvatarDraft(nextProfile.avatarUrl ?? '');
    }
    updateShellProfile(nextProfile.displayName, nextProfile.avatarUrl);
  }, [avatarTouched, displayNameTouched, isEditingProfile, updateShellProfile]);

  const refreshBalanceWithSignal = useCallback(async (signal: AbortSignal) => {
    const res = await fetch('/bff/wallet/balance', { cache: 'no-store', signal });
    const payload = (await res.json().catch(() => null)) as BillingRouteResponse<WalletBalanceSnapshot> | null;
    if (!res.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error?.message ?? tp.refreshFailed);
    }
    setBalance(payload.data);
  }, []);

  const { isRefreshing, lastUpdatedAt, error, refreshNow } = useAutoRefresh({
    enabled: canManageBilling && isConnectedSession,
    intervalMs: 60_000,
    refresh: refreshBalanceWithSignal,
    pauseWhenHidden: true,
  });

  // ── Avatar file upload (canvas resize → JPEG 256×256, ~20–50 KB) ──
  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError(tp.imageFileError);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setProfileError(tp.imageLargeError);
      return;
    }

    try {
      const dataUrl = await resizeAvatarFile(file);
      setAvatarTouched(true);
      setAvatarDraft(dataUrl);
      setProfileError(null);
    } catch {
      setProfileError(tp.imageProcessError);
    }
  }

  async function handleProfileSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileError(null);

    if (!isConnectedSession) {
      setProfileError(s.errors.notConnected);
      return;
    }

    setProfileStatus(s.account.saving);
    setIsSavingProfile(true);

    try {
      // Resolve the final avatar URL.
      // - empty string / regular URL → use directly
      // - SVG data URL (emoji) → use directly (tiny, < 2048 chars)
      // - JPEG/PNG data URL (device upload) → upload to /api/user/avatar first, get short URL
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
            s.errors.unableToSave,
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
        setProfileError(payload?.error?.message ?? s.errors.unableToUpdate);
        setIsSavingProfile(false);
        return;
      }

      setProfileState(payload.data);
      setDisplayNameDraft(payload.data.displayName ?? '');
      setAvatarDraft(payload.data.avatarUrl ?? '');
      setDisplayNameTouched(false);
      setAvatarTouched(false);
      updateShellProfile(payload.data.displayName, payload.data.avatarUrl);
      setProfileStatus(s.account.savedMessage);
      setIsEditingProfile(false);
      setIsSavingProfile(false);
      // Refresh server-component data so sidebar dock stays in sync after navigation
      router.refresh();
    } catch {
      setProfileStatus(null);
      setProfileError(s.errors.unableToSave);
      setIsSavingProfile(false);
    }
  }

  function handleCancelEdit() {
    setIsEditingProfile(false);
    setDisplayNameDraft(profileState?.displayName ?? session.user.displayName ?? '');
    setAvatarDraft(profileState?.avatarUrl ?? '');
    setDisplayNameTouched(false);
    setAvatarTouched(false);
    setProfileError(null);
    setProfileStatus(null);
  }

  async function handleManualRefresh() {
    setProfileError(null);
    setProfileStatus(null);
    try {
      await Promise.all([
        refreshProfile(new AbortController().signal),
        refreshNow(),
      ]);
      setProfileStatus(tp.updatedJustNow);
    } catch {
      setProfileError(tp.refreshFailed);
    }
  }

  async function handleCreateTopUp() {
    if (!canManageBilling) return;
    if (!customAmountValid) {
      setBillingError(tb.invalidAmount);
      return;
    }

    setActiveAction('create_topup');
    setBillingError(null);
    setBillingStatus(tb.creatingPayment);

    try {
      const response = await fetch('/bff/wallet/topups/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountKopecks: effectiveKopecks }),
      });
      const payload = (await response.json().catch(() => null)) as BillingRouteResponse<WalletTopUpCreateResult> | null;

      if (!response.ok || !payload?.ok || !payload.data?.confirmationToken) {
        setActiveAction(null);
        setBillingStatus(null);
        setBillingError(payload?.error?.message ?? tb.creatingPaymentError);
        return;
      }

      setWidgetToken(payload.data.confirmationToken);
      setBillingStatus(tb.paymentCreated);
      setActiveAction(null);
    } catch {
      setActiveAction(null);
      setBillingStatus(null);
      setBillingError(tb.serverError);
    }
  }

  function handleOpenModal() {
    setShowModal(true);
    setWidgetToken(null);
    setBillingError(null);
    setBillingStatus(null);
    setUseCustom(false);
    setSelectedKopecks(50_000);
    setCustomAmount('');
  }

  function handleCloseModal() {
    widgetRef.current?.destroy();
    widgetRef.current = null;
    setWidgetToken(null);
    setWidgetReady(false);
    setShowModal(false);
    setActiveAction(null);
    setBillingError(null);
    setBillingStatus(null);
    void refreshBalance();
  }

  const previewAvatarUrl = isEditingProfile ? avatarDraft : avatarUrl;
  // Reset on every new committed avatar URL so we retry on change
  useEffect(() => { setProfileAvatarError(false); }, [avatarUrl]);

  return (
    <>
      <Script
        src="https://yookassa.ru/checkout-widget/v1/checkout-widget.js"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* Hidden file input for avatar upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleFileChange(e)}
        aria-hidden="true"
      />

      <section className="split-grid">
        {/* ── Block 1: Profile ── */}
        <article className="panel">
          <span className="micro-label">{tp.profileSection}</span>

          {profileStatus ? (
            <div className="banner banner-info" style={{ marginTop: '8px' }}>{profileStatus}</div>
          ) : null}
          {profileError ? (
            <div className="banner banner-error" style={{ marginTop: '8px' }}>{profileError}</div>
          ) : null}
          {lastUpdatedAt && !profileError ? (
            <div className="list-muted" style={{ marginTop: '8px', fontSize: '0.78rem' }}>
              {error ? tp.refreshFailed : tp.updatedJustNow}
            </div>
          ) : null}

          {isEditingProfile ? (
            <form
              className="settings-profile-form"
              onSubmit={(e) => void handleProfileSave(e)}
              style={{ marginTop: '12px' }}
            >
              {/* ── Avatar editor ── */}
              <div className="profile-avatar-editor">
                {/* Preview */}
                <div className="profile-avatar-preview">
                  <div className="profile-avatar-preview__circle" aria-hidden="true">
                    {avatarDraft ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarDraft}
                        alt=""
                        className={isEmojiAvatarUrl(avatarDraft) ? 'profile-avatar-preview__emoji' : 'profile-avatar-preview__img'}
                        onError={() => {
                          setAvatarTouched(true);
                          setAvatarDraft('');
                        }}
                      />
                    ) : (
                      <span className="profile-avatar-preview__initials">{initials}</span>
                    )}
                  </div>
                  <div className="profile-avatar-upload-btn-wrap">
                    <button
                      type="button"
                      className="avatar-upload-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M7 1v8M4 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 10v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      {tp.uploadAvatar}
                    </button>
                  </div>
                </div>

                {/* Emoji picker */}
                <div className="profile-avatar-picker">
                  <span className="micro-label" style={{ marginBottom: '8px', display: 'block' }}>
                    {tp.avatarPickerLabel}
                  </span>
                  <div className="avatar-emoji-grid">
                    {PRESET_AVATARS.map((emoji) => {
                      const emojiUrl = makeEmojiAvatarUrl(emoji);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={`avatar-emoji-btn${avatarDraft === emojiUrl ? ' avatar-emoji-btn--active' : ''}`}
                          onClick={() => {
                            setAvatarTouched(true);
                            setAvatarDraft(emojiUrl);
                          }}
                          aria-label={emoji}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {avatarDraft ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ marginTop: '2px', fontSize: '0.82rem', padding: '5px 12px' }}
                    onClick={() => {
                      setAvatarTouched(true);
                      setAvatarDraft('');
                    }}
                  >
                    {tp.removeAvatar}
                  </button>
                ) : null}
              </div>

              {/* ── Display name ── */}
              <div className="form-grid" style={{ marginTop: '16px' }}>
                <label className="form-field">
                  <span className="form-field__label">{s.account.displayNameLabel}</span>
                  <input
                    name="displayName"
                    placeholder={s.account.displayNamePlaceholder}
                    type="text"
                    value={displayNameDraft}
                    onChange={(e) => {
                      setDisplayNameTouched(true);
                      setDisplayNameDraft(e.target.value);
                    }}
                  />
                </label>
              </div>

              <div className="settings-inline-actions" style={{ marginTop: '12px' }}>
                <button
                  className="btn-primary"
                  disabled={!isConnectedSession || isSavingProfile}
                  type="submit"
                >
                  {isSavingProfile ? s.account.saving : s.account.saveButton}
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={handleCancelEdit}
                >
                  {t.common.cancel}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Identity display */}
              <div className="profile-identity" style={{ marginTop: '12px' }}>
                <div className="profile-avatar" aria-hidden="true">
                  {previewAvatarUrl && !profileAvatarError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewAvatarUrl}
                      alt=""
                      className={isEmojiAvatarUrl(previewAvatarUrl) ? 'profile-avatar__emoji' : 'profile-avatar__img'}
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
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    setIsEditingProfile(true);
                    setAvatarDraft(profileState?.avatarUrl ?? '');
                    setAvatarTouched(false);
                    setDisplayNameTouched(false);
                    setProfileError(null);
                    setProfileStatus(null);
                  }}
                >
                  {tp.editProfile}
                </button>
                <button className="btn-ghost" type="button" onClick={() => void handleManualRefresh()} disabled={isRefreshing || isSavingProfile}>
                  {isRefreshing ? tp.refreshing : tp.refresh}
                </button>
              </div>
            </>
          )}
        </article>

        {/* ── Block 2: Balance & Top-up ── */}
        <article className="panel">
          <div className="wallet-balance-header">
            <span className="micro-label">{tp.balanceSection}</span>
            <span className="wallet-balance-provider-badge">YooKassa</span>
          </div>

          <div className="wallet-balance-amount">
            {formatBalanceFromKopecks(balance?.balanceKopecks ?? 0, prefs.balanceDisplayCurrency, exchangeRates)}
          </div>
          <p className="wallet-balance-currency">{tp.balanceHint}</p>

          {canManageBilling && isConnectedSession ? (
            <button
              className="btn-primary wallet-topup-btn"
              onClick={handleOpenModal}
              type="button"
            >
              {tb.addFundsBtn}
            </button>
          ) : (
            <p className="list-muted">
              {isConnectedSession ? tb.insufficientPermissions : tb.signInToManage}
            </p>
          )}

          <div style={{ marginTop: '12px' }}>
            <Link href="/app/billing" className="link-subtle">
              {tp.paymentHistory}
            </Link>
          </div>
        </article>
      </section>

      {/* ── Top-up modal ── */}
      {showModal ? (
        <div
          className="wallet-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={tb.addFunds}
        >
          <article className="wallet-modal panel">
            <div className="wallet-modal-header">
              <h2>{tb.addFunds}</h2>
              <button
                className="wallet-modal-close"
                onClick={handleCloseModal}
                type="button"
                aria-label={t.common.close}
              >
                &#x2715;
              </button>
            </div>

            {billingStatus ? (
              <div className="billing-banner billing-banner-info">{billingStatus}</div>
            ) : null}
            {billingError ? (
              <div className="billing-banner billing-banner-error">{billingError}</div>
            ) : null}

            {!widgetToken ? (
              <>
                <div className="wallet-amount-section">
                  <span className="micro-label">{tb.selectAmount}</span>
                  <div className="wallet-preset-grid">
                    {PRESET_AMOUNTS_KOPECKS.map((amount) => (
                      <button
                        key={amount}
                        className={
                          !useCustom && selectedKopecks === amount
                            ? 'wallet-preset-btn active'
                            : 'wallet-preset-btn'
                        }
                        type="button"
                        onClick={() => {
                          setUseCustom(false);
                          setSelectedKopecks(amount);
                        }}
                      >
                        {formatBalanceFromKopecks(amount)}
                      </button>
                    ))}
                    <button
                      className={useCustom ? 'wallet-preset-btn active' : 'wallet-preset-btn'}
                      type="button"
                      onClick={() => setUseCustom(true)}
                    >
                      {tb.custom}
                    </button>
                  </div>

                  {useCustom ? (
                    <div className="wallet-custom-amount">
                      <label className="micro-label" htmlFor="profile-custom-amount">
                        {tb.amountRub}
                      </label>
                      <div className="wallet-custom-input-wrap">
                        <input
                          className="wallet-custom-input"
                          id="profile-custom-amount"
                          inputMode="decimal"
                          min="10"
                          max="1000000"
                          placeholder={tp.eg500}
                          type="number"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                        />
                        <span className="wallet-custom-suffix">&#x20BD;</span>
                      </div>
                      {useCustom && customAmount && !customAmountValid ? (
                        <p className="wallet-input-error">{tb.invalidAmount}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="wallet-pay-summary">
                  <span>{tb.total}</span>
                  <strong>{customAmountValid ? formatBalanceFromKopecks(effectiveKopecks) : '\u2014'}</strong>
                </div>

                <button
                  className="btn-primary wallet-pay-btn"
                  disabled={
                    !customAmountValid ||
                    activeAction === 'create_topup' ||
                    effectiveKopecks < 1_000
                  }
                  type="button"
                  onClick={() => void handleCreateTopUp()}
                >
                  {activeAction === 'create_topup' ? tb.creatingPayment : tb.continueToPayment}
                </button>
              </>
            ) : null}

            {widgetToken ? (
              <div className="wallet-widget-section">
                {!widgetReady ? (
                  <div className="wallet-widget-loading">
                    <div className="wallet-spinner" />
                    <span>{tb.loadingPaymentForm}</span>
                  </div>
                ) : null}
                <div
                  id="profile-yookassa-widget"
                  className="wallet-widget-container"
                  style={{ minHeight: widgetReady ? undefined : 0 }}
                />
              </div>
            ) : null}
          </article>
        </div>
      ) : null}
    </>
  );
}

export function ProfileSignInPrompt() {
  const { t } = usePreferences();
  const tp = t.profile;
  return (
    <section className="dash-signin-prompt">
      <div className="dash-signin-icon" aria-hidden="true">&#x1F510;</div>
      <div className="dash-signin-copy">
        <span className="micro-label">{tp.signInPromptLabel}</span>
        <h2>{tp.signInPromptHeading}</h2>
        <p>{tp.signInPromptDesc}</p>
      </div>
      <div className="link-row dash-signin-actions">
        <Link className="btn-primary" href="/auth/login">{tp.signIn}</Link>
        <Link className="btn-ghost" href="/">{tp.backToHome}</Link>
      </div>
    </section>
  );
}
