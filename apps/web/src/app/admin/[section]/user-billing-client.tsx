'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePreferences } from '../../../lib/preferences';
import type { AdminBillingUserRow, AdminBillingUsersPayload } from '@quizmind/contracts';

export function UserBillingAdminClient() {
  const { t } = usePreferences();
  const ub = t.admin.userBilling;
  const [items, setItems] = useState<AdminBillingUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function loadUsers() {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    const res = await fetch(`/bff/admin/billing/users${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
    const payload = await res.json().catch(() => null) as { ok?: boolean; data?: AdminBillingUsersPayload } | null;
    if (!res.ok || !payload?.ok || !payload.data) {
      setError(ub.failedToLoadUsers); setLoading(false); return;
    }
    setItems(payload.data.items); setLoading(false);
  }

  useEffect(() => { void loadUsers(); }, []);

  const rows = useMemo(() => items, [items]);

  return <section className="panel" style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <div>
        <h2 style={{ margin: 0 }}>{ub.title}</h2>
        <p style={{ margin: '6px 0 0' }}>{ub.description}</p>
      </div>
      <button className="btn-ghost" onClick={() => void loadUsers()}>{ub.refresh}</button>
    </div>
    <label style={{ display: 'grid', gap: 6 }}>
      <span className="micro-label">{ub.searchUsers}</span>
      <input value={search} onChange={(e) => setSearch(e.target.value)} />
    </label>
    {loading ? <p>{ub.loadingUsers}</p> : null}
    {error ? <div><p>{ub.failedToLoadUsers}</p><button className="btn-ghost" onClick={() => void loadUsers()}>{ub.retry}</button></div> : null}
    {!loading && !error ? (
      <table>
        <thead><tr><th>{ub.user}</th><th>{ub.email}</th><th>{ub.balance}</th><th>{ub.commissionStatus}</th><th>{ub.customMarkup}</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={5}>{ub.noUsers}</td></tr> : rows.map((row) => <tr key={row.userId}><td>{row.displayName ?? row.userId}</td><td>{row.email}</td><td>{row.balanceKopecks / 100} {row.walletCurrency}</td><td>{row.aiPlatformFeeExempt ? ub.platformFeeExempt : ub.standardCommission}</td><td>{row.aiMarkupPercentOverride ?? '—'}</td></tr>)}
        </tbody>
      </table>
    ) : null}
    <div className="panel"><h3>{ub.manualAdjustments}</h3><p>{ub.manualAdjustmentsComingSoon}</p></div>
    <div className="panel"><h3>{ub.commissionOverrides}</h3><p>{ub.commissionOverridesComingSoon}</p></div>
  </section>;
}
