'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type WalletBalanceSnapshot, type WalletTopUpEntry, type WalletTopUpCreateResult } from '@quizmind/contracts';

import { usePreferences } from '../../../lib/preferences';

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

function statusClass(status: string): string {
  switch (status) {
    case 'succeeded': return 'tag wallet-tag-success';
    case 'pending':   return 'tag wallet-tag-pending';
    case 'canceled':
    case 'refunded':  return 'tag warn';
    default:          return 'tag';
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
}: BillingPageClientProps) {
  const { t } = usePreferences();
  const tb = t.billing;
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

  // Translate payment status to current language
  function statusLabel(status: string): string {
    switch (status) {
      case 'pending':   return tb.pending;
      case 'succeeded': return tb.paid;
      case 'canceled':  return tb.cancelled;
      case 'refunded':  return tb.refunded;
      default:          return status;
    }
  }

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet/balance', {
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => null)) as BillingRouteResponse<WalletBalanceSnapshot> | null;
      if (res.ok && payload?.ok && payload.data) {
        setBalance(payload.data);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    if (!widgetToken || !scriptLoaded) return;

    const container = 'yookassa-widget-container';

    async function mountWidget() {
      if (!window.YooMoneyCheckoutWidget) {
        setErrorMessage(tb.widgetLoadError);
        return;
      }

      widgetRef.current?.destroy();

      const widget = new window.YooMoneyCheckoutWidget({
        confirmation_token: widgetToken!,
        return_url: window.location.href,
        error_callback: (err) => {
          if (err.error === 'token_expired') {
            setWidgetToken(null);
            setErrorMessage(tb.tokenExpired);
          } else {
            setErrorMessage(`${tb.widgetError} ${err.error}`);
          }
          setActiveAction(null);
        },
      });

      widgetRef.current = widget;

      try {
        await widget.render(container);
        setWidgetReady(true);
      } catch {
        setErrorMessage(tb.widgetRenderError);
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

  async function handleCreateTopUp() {
    if (!canManageBilling) return;
    if (!customAmountValid) {
      setErrorMessage(tb.invalidAmount);
      return;
    }

    setActiveAction('create_topup');
    setErrorMessage(null);
    setStatusMessage(tb.creatingPayment);

    try {
      const response = await fetch('/api/wallet/topups/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountKopecks: effectiveKopecks }),
      });
      const payload = (await response.json().catch(() => null)) as BillingRouteResponse<WalletTopUpCreateResult> | null;

      if (!response.ok || !payload?.ok || !payload.data?.confirmationToken) {
        setActiveAction(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? tb.creatingPaymentError);
        return;
      }

      const result = payload.data;

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
      setStatusMessage(tb.paymentCreated);
      setActiveAction(null);
    } catch {
      setActiveAction(null);
      setStatusMessage(null);
      setErrorMessage(tb.serverError);
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

      {/* Top-up modal */}
      {showModal ? (
        <div className="wallet-modal-backdrop" role="dialog" aria-modal="true" aria-label={tb.addFunds}>
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

            {statusMessage ? <div className="billing-banner billing-banner-info">{statusMessage}</div> : null}
            {errorMessage ? <div className="billing-banner billing-banner-error">{errorMessage}</div> : null}

            {!widgetToken ? (
              <>
                <div className="wallet-amount-section">
                  <span className="micro-label">{tb.selectAmount}</span>
                  <div className="wallet-preset-grid">
                    {PRESET_AMOUNTS_KOPECKS.map((amount) => (
                      <button
                        key={amount}
                        className={!useCustom && selectedKopecks === amount ? 'wallet-preset-btn active' : 'wallet-preset-btn'}
                        onClick={() => { setUseCustom(false); setSelectedKopecks(amount); }}
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
                      {tb.custom}
                    </button>
                  </div>

                  {useCustom ? (
                    <div className="wallet-custom-amount">
                      <label className="micro-label" htmlFor="custom-amount">{tb.amountRub}</label>
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
                  disabled={!customAmountValid || activeAction === 'create_topup' || effectiveKopecks < 1_000}
                  onClick={() => void handleCreateTopUp()}
                  type="button"
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
                  id="yookassa-widget-container"
                  className="wallet-widget-container"
                  style={{ minHeight: widgetReady ? undefined : 0 }}
                />
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      {/* Transaction history */}
      <section className="panel wallet-history-panel">
        <div className="wallet-history-panel-head">
          <div>
            <span className="page-section__label">{tb.transactionHistory}</span>
            <h2 className="wallet-history-title">{tb.transactions}</h2>
          </div>
        </div>

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
                      ? `${tb.paidLabel} ${formatDate(topUp.paidAt)}`
                      : `${tb.createdLabel} ${formatDate(topUp.createdAt)}`}
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
            <span className="micro-label">{tb.noTransactionsYet}</span>
            <h2>{tb.noTransactions}</h2>
            <p>{tb.noTransactionsDesc}</p>
          </div>
        )}
      </section>
    </>
  );
}
