'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  type BillingCheckoutResult,
  type BillingInterval,
  type BillingInvoicePdfResult,
  type BillingInvoicesPayload,
  type BillingPlanCatalogEntry,
  type BillingPortalResult,
  type BillingSubscriptionMutationResult,
} from '@quizmind/contracts';

import { type BillingPlansSnapshot, type WorkspaceSubscriptionSnapshot } from '../../../lib/api';

interface BillingRouteResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
  };
}

interface BillingPageClientProps {
  canManageBilling: boolean;
  initialInvoices: BillingInvoicesPayload | null;
  initialPlans: BillingPlansSnapshot | null;
  initialSubscription: WorkspaceSubscriptionSnapshot;
  isConnectedSession: boolean;
  workspaceId: string;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'TBD';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatIntervalLabel(interval: BillingInterval) {
  return interval === 'yearly' ? 'year' : 'month';
}

function findPrice(plan: BillingPlanCatalogEntry | undefined, interval: BillingInterval) {
  return (
    plan?.prices.find((price) => price.interval === interval) ??
    plan?.prices.find((price) => price.isDefault) ??
    plan?.prices[0]
  );
}

function readLimit(plan: BillingPlanCatalogEntry | undefined, key: string) {
  return plan?.plan.entitlements.find((entitlement) => entitlement.key === key)?.limit;
}

function hasFeature(plan: BillingPlanCatalogEntry | undefined, keys: string[]) {
  return keys.some((key) => plan?.plan.entitlements.some((entitlement) => entitlement.key === key && entitlement.enabled));
}

function buildPlanHighlights(plan: BillingPlanCatalogEntry | undefined) {
  if (!plan) {
    return [];
  }

  return [
    `${readLimit(plan, 'limit.requests_per_day') ?? 'Unlimited'} requests / day`,
    `${readLimit(plan, 'limit.screenshots_per_day') ?? 0} screenshots / day`,
    `${readLimit(plan, 'limit.seats') ?? 1} seat${(readLimit(plan, 'limit.seats') ?? 1) === 1 ? '' : 's'}`,
    `${readLimit(plan, 'limit.history_retention_days') ?? 7} days history`,
    hasFeature(plan, ['feature.remote_sync', 'feature.remote_config']) ? 'Remote sync enabled' : 'Remote sync disabled',
    hasFeature(plan, ['feature.priority_support']) ? 'Priority support' : 'Standard support',
  ];
}

export function BillingPageClient({
  canManageBilling,
  initialInvoices,
  initialPlans,
  initialSubscription,
  isConnectedSession,
  workspaceId,
}: BillingPageClientProps) {
  const searchParams = useSearchParams();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>(initialSubscription.summary.billingInterval);
  const [subscriptionState, setSubscriptionState] = useState(initialSubscription.summary);
  const plans = initialPlans?.plans ?? [];
  const currentPlan = plans.find((plan) => plan.plan.code === subscriptionState.planCode) ?? plans[0];
  const currentPrice = findPrice(currentPlan, subscriptionState.billingInterval);
  const checkoutState = searchParams.get('checkout');
  const checkoutBanner =
    checkoutState === 'success'
      ? 'Checkout completed. Stripe webhook reconciliation may take a few seconds to refresh the final status.'
      : checkoutState === 'canceled'
        ? 'Checkout was canceled before payment was submitted.'
        : null;

  async function handleCheckout(planCode: string) {
    setActiveAction(`checkout:${planCode}`);
    setErrorMessage(null);
    setStatusMessage(`Starting the ${planCode} checkout flow...`);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId,
          planCode,
          interval: selectedInterval,
          successPath: `/app/billing?workspaceId=${workspaceId}&checkout=success`,
          cancelPath: `/app/billing?workspaceId=${workspaceId}&checkout=canceled`,
        }),
      });
      const payload = (await response.json().catch(() => null)) as BillingRouteResponse<BillingCheckoutResult> | null;

      if (!response.ok || !payload?.ok || !payload.data?.redirectUrl) {
        setActiveAction(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to create a billing checkout session right now.');
        return;
      }

      window.location.assign(payload.data.redirectUrl);
    } catch {
      setActiveAction(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the billing checkout route right now.');
    }
  }

  async function handlePortal() {
    setActiveAction('portal');
    setErrorMessage(null);
    setStatusMessage('Opening Stripe Customer Portal...');

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId,
          returnPath: `/app/billing?workspaceId=${workspaceId}`,
        }),
      });
      const payload = (await response.json().catch(() => null)) as BillingRouteResponse<BillingPortalResult> | null;

      if (!response.ok || !payload?.ok || !payload.data?.redirectUrl) {
        setActiveAction(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to open the billing portal right now.');
        return;
      }

      window.location.assign(payload.data.redirectUrl);
    } catch {
      setActiveAction(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the billing portal route right now.');
    }
  }

  async function handleInvoiceDownload(invoiceId: string) {
    setActiveAction(`invoice:${invoiceId}`);
    setErrorMessage(null);
    setStatusMessage('Preparing invoice export...');

    try {
      const response = await fetch(`/api/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as BillingRouteResponse<BillingInvoicePdfResult> | null;

      if (!response.ok || !payload?.ok || !payload.data?.redirectUrl) {
        setActiveAction(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to open the invoice export right now.');
        return;
      }

      setActiveAction(null);
      setStatusMessage(null);
      const popup = window.open(payload.data.redirectUrl, '_blank', 'noopener,noreferrer');

      if (!popup) {
        window.location.assign(payload.data.redirectUrl);
      }
    } catch {
      setActiveAction(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the invoice export route right now.');
    }
  }

  async function handleSubscriptionMutation(mode: 'cancel' | 'resume') {
    setActiveAction(mode);
    setErrorMessage(null);
    setStatusMessage(mode === 'cancel' ? 'Scheduling cancellation at period end...' : 'Resuming the current subscription...');

    try {
      const response = await fetch(`/api/billing/${mode}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as BillingRouteResponse<BillingSubscriptionMutationResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveAction(null);
        setStatusMessage(null);
        setErrorMessage(
          payload?.error?.message ??
            (mode === 'cancel'
              ? 'Unable to schedule cancellation right now.'
              : 'Unable to resume the subscription right now.'),
        );
        return;
      }

      setSubscriptionState((current) => ({
        ...current,
        status: payload.data?.status ?? current.status,
        cancelAtPeriodEnd: payload.data?.cancelAtPeriodEnd ?? current.cancelAtPeriodEnd,
        currentPeriodEnd: payload.data?.currentPeriodEnd ?? current.currentPeriodEnd,
      }));
      setActiveAction(null);
      setStatusMessage(
        mode === 'cancel'
          ? 'Cancellation scheduled. Access stays active until the current billing period ends.'
          : 'Cancellation removed. The subscription will renew normally.',
      );
    } catch {
      setActiveAction(null);
      setStatusMessage(null);
      setErrorMessage(
        mode === 'cancel'
          ? 'Unable to reach the cancellation route right now.'
          : 'Unable to reach the resume route right now.',
      );
    }
  }

  return (
    <>
      {checkoutBanner ? <section className="billing-banner billing-banner-info">{checkoutBanner}</section> : null}
      {statusMessage ? <section className="billing-banner billing-banner-info">{statusMessage}</section> : null}
      {errorMessage ? <section className="billing-banner billing-banner-error">{errorMessage}</section> : null}

      <section className="billing-metrics">
        <article className="stat-card">
          <span className="micro-label">Current plan</span>
          <p className="stat-value">{currentPlan?.plan.name ?? subscriptionState.planCode}</p>
          <p className="metric-copy">
            {currentPrice
              ? `${formatMoney(currentPrice.amount, currentPrice.currency)} / ${formatIntervalLabel(subscriptionState.billingInterval)}`
              : 'Custom pricing'}
          </p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Renewal</span>
          <p className="stat-value">{subscriptionState.cancelAtPeriodEnd ? 'Ends soon' : 'Auto-renew'}</p>
          <p className="metric-copy">{formatDate(subscriptionState.currentPeriodEnd)}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Seats</span>
          <p className="stat-value">{subscriptionState.seatCount}</p>
          <p className="metric-copy">Allocated to this workspace</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Invoices</span>
          <p className="stat-value">{initialInvoices?.items.length ?? 0}</p>
          <p className="metric-copy">Visible in billing history</p>
        </article>
      </section>

      <section className="billing-layout">
        <article className="panel billing-current-plan">
          <span className="micro-label">Current plan</span>
          <div className="billing-current-plan-header">
            <div>
              <h2>{currentPlan?.plan.name ?? subscriptionState.planCode}</h2>
              <p>{currentPlan?.plan.description ?? 'Current workspace billing state.'}</p>
            </div>
            <div className="billing-price-chip">
              {currentPrice ? formatMoney(currentPrice.amount, currentPrice.currency) : 'Custom'}
              <span>/{formatIntervalLabel(subscriptionState.billingInterval)}</span>
            </div>
          </div>
          <div className="tag-row">
            <span className="tag">{subscriptionState.status}</span>
            <span className={subscriptionState.cancelAtPeriodEnd ? 'tag warn' : 'tag'}>
              {subscriptionState.cancelAtPeriodEnd ? 'cancel at period end' : 'renews automatically'}
            </span>
          </div>
          <div className="billing-entitlements">
            {currentPlan
              ? buildPlanHighlights(currentPlan).map((highlight) => (
                  <div className="billing-highlight" key={highlight}>
                    {highlight}
                  </div>
                ))
              : null}
          </div>
        </article>

        <article className="panel billing-payment-card">
          <span className="micro-label">Payment method</span>
          <h2>Manage billing in Stripe</h2>
          <p>
            Card details and tax information stay inside Stripe Customer Portal. Use it to update payment methods,
            download receipts from Stripe, and review renewal settings.
          </p>
          <div className="billing-inline-actions">
            <button
              className="btn-primary"
              disabled={!canManageBilling || activeAction === 'portal'}
              onClick={() => void handlePortal()}
              type="button"
            >
              {activeAction === 'portal' ? 'Opening portal...' : 'Update payment method'}
            </button>
            {!isConnectedSession ? <span className="list-muted">Connected session required for live billing actions.</span> : null}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="billing-section-header">
          <div>
            <span className="micro-label">Upgrade</span>
            <h2>Plans and comparison</h2>
            <p>Select monthly or yearly pricing, compare plan limits, and launch Stripe Checkout.</p>
          </div>
          <div className="billing-interval-toggle">
            {(['monthly', 'yearly'] as const).map((interval) => (
              <button
                className={selectedInterval === interval ? 'billing-toggle active' : 'billing-toggle'}
                key={interval}
                onClick={() => setSelectedInterval(interval)}
                type="button"
              >
                {interval === 'monthly' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
        </div>

        <div className="billing-plan-grid">
          {plans.map((plan) => {
            const price = findPrice(plan, selectedInterval);
            const isCurrentPlan = plan.plan.code === subscriptionState.planCode;
            const actionDisabled = !canManageBilling || isCurrentPlan || plan.plan.code === 'free';

            return (
              <article className={isCurrentPlan ? 'billing-plan-card current' : 'billing-plan-card'} key={plan.plan.code}>
                <div className="billing-plan-header">
                  <div>
                    <span className="micro-label">{plan.plan.code}</span>
                    <h3>{plan.plan.name}</h3>
                    <p>{plan.plan.description}</p>
                  </div>
                  <div className="billing-plan-price">
                    {price ? formatMoney(price.amount, price.currency) : 'Custom'}
                    <span>{price ? `/${formatIntervalLabel(price.interval)}` : ''}</span>
                  </div>
                </div>

                <div className="billing-highlight-grid">
                  {buildPlanHighlights(plan).slice(0, 6).map((highlight) => (
                    <div className="billing-highlight" key={`${plan.plan.code}:${highlight}`}>
                      {highlight}
                    </div>
                  ))}
                </div>

                <div className="billing-inline-actions">
                  <button
                    className={isCurrentPlan ? 'btn-ghost' : 'btn-primary'}
                    disabled={actionDisabled || activeAction === `checkout:${plan.plan.code}`}
                    onClick={() => void handleCheckout(plan.plan.code)}
                    type="button"
                  >
                    {isCurrentPlan
                      ? 'Current plan'
                      : activeAction === `checkout:${plan.plan.code}`
                        ? 'Redirecting...'
                        : `Upgrade to ${plan.plan.name}`}
                  </button>
                  {!canManageBilling ? (
                    <span className="list-muted">
                      {isConnectedSession ? 'This session can view billing but cannot change it.' : 'Preview only'}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Billing history</span>
          <h2>Invoices</h2>
          {initialInvoices?.items.length ? (
            <div className="billing-history">
              {initialInvoices.items.map((invoice) => (
                <div className="billing-history-row" key={invoice.id}>
                  <div>
                    <strong>{formatMoney(invoice.amountDue, invoice.currency)}</strong>
                    <p className="list-muted">
                      {invoice.externalId ?? invoice.id} · issued {formatDate(invoice.issuedAt)}
                    </p>
                  </div>
                  <div className="billing-history-meta">
                    <span className={invoice.status === 'paid' ? 'tag' : 'tag warn'}>{invoice.status}</span>
                    <button
                      className="btn-ghost"
                      disabled={activeAction === `invoice:${invoice.id}`}
                      onClick={() => void handleInvoiceDownload(invoice.id)}
                      type="button"
                    >
                      {activeAction === `invoice:${invoice.id}` ? 'Opening...' : 'Download PDF'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="micro-label">No invoices yet</span>
              <h2>Billing history will appear after the first successful payment.</h2>
              <p>Once Stripe invoices start landing, this panel will show dates, paid status, and export actions.</p>
            </div>
          )}
        </article>

        <article className="panel billing-danger-card">
          <span className="micro-label">Danger zone</span>
          <h2>{subscriptionState.cancelAtPeriodEnd ? 'Cancellation is scheduled' : 'Cancel the subscription'}</h2>
          <p>
            {subscriptionState.cancelAtPeriodEnd
              ? `Access remains active until ${formatDate(subscriptionState.currentPeriodEnd)}. You can still resume before the period ends.`
              : 'Canceling keeps the workspace active through the current billing period and prevents the next renewal.'}
          </p>
          <div className="billing-inline-actions">
            {subscriptionState.cancelAtPeriodEnd ? (
              <button
                className="btn-primary"
                disabled={!canManageBilling || activeAction === 'resume'}
                onClick={() => void handleSubscriptionMutation('resume')}
                type="button"
              >
                {activeAction === 'resume' ? 'Resuming...' : 'Resume subscription'}
              </button>
            ) : (
              <button
                className="btn-ghost billing-danger-button"
                disabled={!canManageBilling || activeAction === 'cancel'}
                onClick={() => void handleSubscriptionMutation('cancel')}
                type="button"
              >
                {activeAction === 'cancel' ? 'Scheduling...' : 'Cancel at period end'}
              </button>
            )}
            <Link className="btn-ghost" href="/app">
              Back to overview
            </Link>
          </div>
        </article>
      </section>
    </>
  );
}
