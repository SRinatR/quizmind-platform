'use client';

import Script from 'next/script';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { type WalletBalanceSnapshot, type WalletTopUpCreateResult } from '@quizmind/contracts';

import type { SessionSnapshot, UserProfileSnapshot } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';

interface ProfilePageClientProps {
  canManageBilling: boolean;
  initialBalance: WalletBalanceSnapshot | null;
  isConnectedSession: boolean;
  session: SessionSnapshot;
  userProfile: UserProfileSnapshot | null;
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

function formatRub(kopecks: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
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
}: ProfilePageClientProps) {
  const { t } = usePreferences();
  const s = t.settings;
  const tb = t.billing;
  const tp = t.profile;

  // ── Profile state ──
  const [profileState, setProfileState] = useState<UserProfileSnapshot | null>(userProfile);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(
    userProfile?.displayName ?? session.user.displayName ?? '',
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);

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
    profileState?.displayName ?? session.user.displayName ?? 'Your account';
  const currentEmail = profileState?.email ?? session.user.email;
  const avatarUrl = profileState?.avatarUrl ?? userProfile?.avatarUrl;
  const initials = currentDisplayName ? getInitials(currentDisplayName) : '?';

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
      const res = await fetch('/api/wallet/balance', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as BillingRouteResponse<WalletBalanceSnapshot> | null;
      if (res.ok && payload?.ok && payload.data) setBalance(payload.data);
    } catch {
      // non-critical
    }
  }, []);

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
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: normalizeInput(displayNameDraft) }),
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
      setProfileStatus(s.account.savedMessage);
      setIsEditingProfile(false);
      setIsSavingProfile(false);
    } catch {
      setProfileStatus(null);
      setProfileError(s.errors.unableToSave);
      setIsSavingProfile(false);
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
      const response = await fetch('/api/wallet/topups/create', {
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

  return (
    <>
      <Script
        src="https://yookassa.ru/checkout-widget/v1/checkout-widget.js"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />

      <section className="split-grid">
        {/* ── Block 1: Profile ── */}
        <article className="panel">
          <span className="micro-label">{tp.profileSection}</span>

          {/* Identity display */}
          <div className="profile-identity">
            <div className="profile-avatar" aria-hidden="true">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="profile-avatar__img" />
              ) : (
                <span className="profile-avatar__initials">{initials}</span>
              )}
            </div>
            <div>
              <h2 className="profile-name">{currentDisplayName}</h2>
              <p className="profile-email">{currentEmail}</p>
            </div>
          </div>

          {profileStatus ? (
            <div className="banner banner-info" style={{ marginTop: '12px' }}>{profileStatus}</div>
          ) : null}
          {profileError ? (
            <div className="banner banner-error" style={{ marginTop: '12px' }}>{profileError}</div>
          ) : null}

          {isEditingProfile ? (
            <form
              className="settings-profile-form"
              onSubmit={(e) => void handleProfileSave(e)}
              style={{ marginTop: '16px' }}
            >
              <div className="form-grid">
                <label className="form-field">
                  <span className="form-field__label">{s.account.displayNameLabel}</span>
                  <input
                    name="displayName"
                    placeholder={s.account.displayNamePlaceholder}
                    type="text"
                    value={displayNameDraft}
                    onChange={(e) => setDisplayNameDraft(e.target.value)}
                  />
                </label>
              </div>
              <div className="settings-inline-actions">
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
                  onClick={() => {
                    setIsEditingProfile(false);
                    setDisplayNameDraft(profileState?.displayName ?? session.user.displayName ?? '');
                    setProfileError(null);
                    setProfileStatus(null);
                  }}
                >
                  {t.common.cancel}
                </button>
              </div>
            </form>
          ) : (
            <div className="link-row" style={{ marginTop: '16px' }}>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  setIsEditingProfile(true);
                  setProfileError(null);
                  setProfileStatus(null);
                }}
              >
                {tp.editProfile}
              </button>
            </div>
          )}
        </article>

        {/* ── Block 2: Balance & Top-up ── */}
        <article className="panel">
          <div className="wallet-balance-header">
            <span className="micro-label">{tp.balanceSection}</span>
            <span className="wallet-balance-provider-badge">YooKassa</span>
          </div>

          <div className="wallet-balance-amount">
            {balance ? formatRub(balance.balanceKopecks) : '\u2014'}
          </div>
          <p className="wallet-balance-currency">{tp.balanceHint}</p>

          {canManageBilling && isConnectedSession ? (
            <button
              className="btn-primary wallet-topup-btn"
              onClick={handleOpenModal}
              type="button"
            >
              {tb.addFunds}
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
                        {formatRub(amount)}
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
                          placeholder="e.g. 500"
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
                  <strong>{customAmountValid ? formatRub(effectiveKopecks) : '\u2014'}</strong>
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
