'use client';

import { type WalletTopUpEntry } from '@quizmind/contracts';

import { usePreferences } from '../../../lib/preferences';

interface BillingPageClientProps {
  initialTopUps: WalletTopUpEntry[];
}

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

export function BillingPageClient({ initialTopUps }: BillingPageClientProps) {
  const { t } = usePreferences();
  const tb = t.billing;

  function statusLabel(status: string): string {
    switch (status) {
      case 'pending':   return tb.pending;
      case 'succeeded': return tb.paid;
      case 'canceled':  return tb.cancelled;
      case 'refunded':  return tb.refunded;
      default:          return status;
    }
  }

  return (
    <section className="panel wallet-history-panel">
      <div className="wallet-history-panel-head">
        <div>
          <span className="page-section__label">{tb.transactionHistory}</span>
          <h2 className="wallet-history-title">{tb.transactions}</h2>
        </div>
      </div>

      {initialTopUps.length > 0 ? (
        <div className="wallet-history">
          {initialTopUps.map((topUp) => (
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
  );
}
