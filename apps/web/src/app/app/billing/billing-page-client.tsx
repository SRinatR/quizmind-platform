'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type WalletBalanceSnapshot, type WalletTopUpEntry, type WalletTopUpCreateResult } from '@quizmind/contracts';

interface BillingRouteResponse<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

interface BillingPageClientProps {
  canManageBilling: boolean;
  initialBalance: WalletBalanceSnapshot | null;
  initialTopUps: WalletTopUpEntry[];
  isConnectedSession: boolean;
  workspaceId: string;
}

const PRESET_AMOUNTS_KOPECKS = [10_000, 30_000, 50_000, 100_000, 300_000] as const;

function formatRub(kopecks: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
}

function formatDate(value?: string | null): string {
  if (!value) return '\u2014';

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'succeeded':
      return 'Paid';
    case 'canceled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'tag wallet-tag-success';
    case 'pending':
      return 'tag wallet-tag-pending';
    case 'canceled':
    case 'refunded':
      return 'tag warn';
    default:
      return 'tag';
  }
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

export function BillingPageClient({
  canManageBilling,
  initialBalance,
  initialTopUps,
  isConnectedSession,
  workspaceId,
}: BillingPageClientProps) {
  const [balance, setBalance] = useState<WalletBalanceSnapshot | null>(initialBalance);
  const [topUps, setTopUps] = useState<WalletTopUpEntry[]>(initialTopUps);
  const [showModal, setShowModal] = useState(false);
  const [selectedKopecks, setSelectedKopecks] = useState<number>(50_000);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch(`/api/wallet/balance?workspaceId=${encodeURIComponent(workspaceId)}`, {
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => null)) as BillingRouteResponse<WalletBalanceSnapshot> | null;

      if (res.ok && payload?.ok && payload.data) {
        setBalance(payload.data);
      }
    } catch {
      // non-critical, keep current balance
    }
  }, [workspaceId]);

  // Mount/destroy YooKassa widget when token changes
  useEffect(() => {
    if (!widgetToken || !scriptLoaded) {
      return;
    }

    const container = 'yookassa-widget-container';

    async function mountWidget() {
      if (!window.YooMoneyCheckoutWidget) {
        setErrorMessage('Failed to load the payment widget. Try refreshing the page.');
        return;
      }

      widgetRef.current?.destroy();

      const widget = new window.YooMoneyCheckoutWidget({
        confirmation_token: widgetToken!,
        return_url: window.location.href,
        error_callback: (err) => {
          if (err.error === 'token_expired') {
            setWidgetToken(null);
            setErrorMessage('Payment session expired. Please start a new payment.');
          } else {
            setErrorMessage(`Widget error: ${err.error}`);
          }
          setActiveAction(null);
        },
      });

      widgetRef.current = widget;

      try {
        await widget.render(container);
        setWidgetReady(true);
      } catch {
        setErrorMessage('Failed to render the payment widget.');
        setActiveAction(null);
      }
    }

    void mountWidget();

    return () => {
      widgetRef.current?.destroy();
      widgetRef.current = null;
      setWidgetReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetToken, scriptLoaded]);

  async function handleCreateTopUp() {
    if (!canManageBilling) return;
    if (!customAmountValid) {
      setErrorMessage('Enter a valid amount (\u20BD10\u2013\u20BD1,000,000).');
      return;
    }

    setActiveAction('create_topup');
    setErrorMessage(null);
    setStatusMessage('Creating payment\u2026');

    try {
      const response = await fetch('/api/wallet/topups/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, amountKopecks: effectiveKopecks }),
      });
      const payload = (await response.json().catch(() => null)) as BillingRouteResponse<WalletTopUpCreateResult> | null;

      if (!response.ok || !payload?.ok || !payload.data?.confirmationToken) {
        setActiveAction(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to create payment. Please try again.');
        return;
      }

      const result = payload.data;

      // Add pending top-up to list immediately for UX
      setTopUps((prev) => [
        {
          id: result.topUpId,
          amountKopecks: result.amountKopecks,
          amountRub: result.amountKopecks / 100,
          currency: result.currency,
          status: 'pending',
          provider: 'yookassa',
          providerPaymentId: result.providerPaymentId,
          idempotenceKey: '',
          paidAt: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      setWidgetToken(result.confirmationToken);
      setStatusMessage('Payment created. Complete checkout in the form below.');
      setActiveAction(null);
    } catch {
      setActiveAction(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the server. Please try again.');
    }
  }

  function handleOpenModal() {
    setShowModal(true);
    setWidgetToken(null);
    setErrorMessage(null);
    setStatusMessage(null);
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
    setErrorMessage(null);
    setStatusMessage(null);
    void refreshBalance();
  }

  return (
    <>
      <Script
        src="https://yookassa.ru/checkout-widget/v1/checkout-widget.js"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* Balance card + top-up trigger */}
      <section className="wallet-hero">
        <article className="wallet-balance-card panel">
          <span className="micro-label">Current balance</span>
          <div className="wallet-balance-amount">
            {balance ? formatRub(balance.balanceKopecks) : '\u2014'}
          </div>
          <p className="wallet-balance-currency">RUB \u00B7 Workspace</p>
          {canManageBilling && isConnectedSession ? (
            <button className="btn-primary wallet-topup-btn" onClick={handleOpenModal} type="button">
              Add funds
            </button>
          ) : (
            <p className="list-muted">
              {isConnectedSession
                ? 'Insufficient permissions to add funds.'
                : 'Sign in to manage your balance.'}
            </p>
          )}
        </article>
      </section>

      {/* Top-up modal */}
      {showModal ? (
        <div className="wallet-modal-backdrop" role="dialog" aria-modal="true" aria-label="Add funds">
          <article className="wallet-modal panel">
            <div className="wallet-modal-header">
              <h2>Add funds</h2>
              <button
                className="wallet-modal-close"
                onClick={handleCloseModal}
                type="button"
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>

            {statusMessage ? (
              <div className="billing-banner billing-banner-info">{statusMessage}</div>
            ) : null}
            {errorMessage ? (
              <div className="billing-banner billing-banner-error">{errorMessage}</div>
            ) : null}

            {/* Only show amount selector if widget not yet opened */}
            {!widgetToken ? (
              <>
                <div className="wallet-amount-section">
                  <span className="micro-label">Select amount</span>
                  <div className="wallet-preset-grid">
                    {PRESET_AMOUNTS_KOPECKS.map((amount) => (
                      <button
                        key={amount}
                        className={
                          !useCustom && selectedKopecks === amount
                            ? 'wallet-preset-btn active'
                            : 'wallet-preset-btn'
                        }
                        onClick={() => {
                          setUseCustom(false);
                          setSelectedKopecks(amount);
                        }}
                        type="button"
                      >
                        {formatRub(amount)}
                      </button>
                    ))}
                    <button
                      className={useCustom ? 'wallet-preset-btn active' : 'wallet-preset-btn'}
                      onClick={() => setUseCustom(true)}
                      type="button"
                    >
                      Custom
                    </button>
                  </div>

                  {useCustom ? (
                    <div className="wallet-custom-amount">
                      <label className="micro-label" htmlFor="custom-amount">
                        Amount (RUB)
                      </label>
                      <div className="wallet-custom-input-wrap">
                        <input
                          className="wallet-custom-input"
                          id="custom-amount"
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
                        <p className="wallet-input-error">Enter an amount from &#x20BD;10 to &#x20BD;1,000,000</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="wallet-pay-summary">
                  <span>Total:</span>
                  <strong>{customAmountValid ? formatRub(effectiveKopecks) : '\u2014'}</strong>
                </div>

                <button
                  className="btn-primary wallet-pay-btn"
                  disabled={
                    !customAmountValid ||
                    activeAction === 'create_topup' ||
                    effectiveKopecks < 1_000
                  }
                  onClick={() => void handleCreateTopUp()}
                  type="button"
                >
                  {activeAction === 'create_topup' ? 'Creating payment\u2026' : 'Continue to payment'}
                </button>
              </>
            ) : null}

            {/* YooKassa widget container */}
            {widgetToken ? (
              <div className="wallet-widget-section">
                {!widgetReady ? (
                  <div className="wallet-widget-loading">
                    <div className="wallet-spinner" />
                    <span>Loading payment form\u2026</span>
                  </div>
                ) : null}
                <div
                  id="yookassa-widget-container"
                  className="wallet-widget-container"
                  style={{ minHeight: widgetReady ? undefined : 0 }}
                />
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      {/* Top-up history */}
      <section className="panel">
        <div className="page-section__head">
          <span className="page-section__label">Transaction history</span>
        </div>
        <h2>Transactions</h2>

        {topUps.length > 0 ? (
          <div className="wallet-history">
            {topUps.map((topUp) => (
              <div className="wallet-history-row" key={topUp.id}>
                <div className="wallet-history-left">
                  <strong className="wallet-history-amount">{formatRub(topUp.amountKopecks)}</strong>
                  <span className={statusClass(topUp.status)}>{statusLabel(topUp.status)}</span>
                </div>
                <div className="wallet-history-right">
                  <span className="list-muted wallet-history-date">
                    {topUp.status === 'succeeded' && topUp.paidAt
                      ? `Paid ${formatDate(topUp.paidAt)}`
                      : `Created ${formatDate(topUp.createdAt)}`}
                  </span>
                  {topUp.providerPaymentId ? (
                    <span className="wallet-history-ref" title={topUp.providerPaymentId}>
                      {topUp.providerPaymentId.slice(0, 8)}\u2026
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">&#x1F4CB;</span>
            <span className="micro-label">No transactions yet</span>
            <h2>No top-ups recorded.</h2>
            <p>Your transaction history will appear here after your first top-up.</p>
          </div>
        )}
      </section>
    </>
  );
}
