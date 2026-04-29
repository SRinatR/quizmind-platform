'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePreferences } from '../../../lib/preferences';
import type { AdminBillingUserRow, AdminBillingUsersPayload } from '@quizmind/contracts';

const ALL_USERS_CONFIRMATION = 'CREDIT ALL USERS';

export function UserBillingAdminClient() {
  const { t } = usePreferences();
  const ub = t.admin.userBilling;
  const [items, setItems] = useState<AdminBillingUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetMode, setTargetMode] = useState<'selected_users' | 'all_users'>('selected_users');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amountRub, setAmountRub] = useState('');
  const [reason, setReason] = useState('');
  const [confirmationText, setConfirmationText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [overrideFeeExempt, setOverrideFeeExempt] = useState(false);
  const [overrideMarkup, setOverrideMarkup] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  async function loadUsers() {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    const res = await fetch(`/bff/admin/billing/users${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
    const payload = await res.json().catch(() => null) as { ok?: boolean; data?: AdminBillingUsersPayload } | null;
    if (!res.ok || !payload?.ok || !payload.data) { setError(ub.failedToLoadUsers); setLoading(false); return; }
    setItems(payload.data.items); setLoading(false);
  }
  useEffect(() => { void loadUsers(); }, []);

  const amount = Number(amountRub);
  const reasonValid = reason.trim().length >= 5;
  const selectionValid = targetMode === 'all_users' ? confirmationText === ALL_USERS_CONFIRMATION : selected.size > 0;
  const amountValid = Number.isFinite(amount) && amount > 0;
  const canSubmit = amountValid && reasonValid && selectionValid && !saving;
  const rows = useMemo(() => items, [items]);

  function toggleUser(userId: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(userId)) next.delete(userId); else next.add(userId); return next; });
  }

  async function submitAdjustment() {
    if (!canSubmit) {
      if (!amountValid) setStatus(ub.amountRequired); else if (!reasonValid) setStatus(ub.reasonRequired); else if (targetMode === 'selected_users') setStatus(ub.selectUsersFirst); else setStatus(ub.confirmationRequired);
      return;
    }
    setSaving(true); setStatus(null);
    const payload = {
      target: targetMode === 'selected_users' ? { type: 'selected_users' as const, userIds: Array.from(selected) } : { type: 'all_users' as const, confirmationText },
      direction,
      amountKopecks: Math.round(amount * 100),
      currency: 'RUB' as const,
      reason: reason.trim(),
      idempotencyKey: crypto.randomUUID(),
    };
    const res = await fetch('/bff/admin/billing/wallet-adjustments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => null) as any;
    if (!res.ok || !body?.ok) { setStatus(ub.failedToApplyAdjustment); setSaving(false); return; }
    setStatus(ub.adjustmentApplied.replace('{count}', String(body.data?.affectedCount ?? 0)));
    setAmountRub(''); setReason(''); setConfirmationText('');
    await loadUsers();
    setSaving(false);
  }

  function startEdit(row: AdminBillingUserRow) {
    setEditingUserId(row.userId); setOverrideFeeExempt(row.aiPlatformFeeExempt); setOverrideMarkup(row.aiMarkupPercentOverride == null ? '' : String(row.aiMarkupPercentOverride)); setOverrideReason(row.billingOverrideReason ?? '');
  }
  async function clearOverride(userId: string) {
    const res = await fetch(`/bff/admin/billing/users/${encodeURIComponent(userId)}/override`, { method: 'DELETE' });
    setStatus(res.ok ? ub.overrideCleared : ub.failedToClearOverride); if (res.ok) await loadUsers();
  }
  async function saveOverride() {
    if (!editingUserId) return;
    if (overrideReason.trim().length < 5) { setStatus(ub.reasonRequired); return; }
    const parsed = overrideMarkup.trim() === '' ? null : Number(overrideMarkup);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 500)) { setStatus(ub.failedToSaveOverride); return; }
    const res = await fetch(`/bff/admin/billing/users/${encodeURIComponent(editingUserId)}/override`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aiPlatformFeeExempt: overrideFeeExempt, aiMarkupPercentOverride: parsed, reason: overrideReason.trim() }) });
    setStatus(res.ok ? ub.overrideSaved : ub.failedToSaveOverride); if (res.ok) { setEditingUserId(null); await loadUsers(); }
  }

  return <section className="panel" style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><h2 style={{ margin: 0 }}>{ub.title}</h2><p style={{ margin: '6px 0 0' }}>{ub.description}</p></div><button className="btn-ghost" onClick={() => void loadUsers()}>{ub.refresh}</button></div>
    <label style={{ display: 'grid', gap: 6 }}><span className="micro-label">{ub.searchUsers}</span><input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="micro-label">{ub.selectedCount.replace('{count}', String(selected.size))}</div>
    {loading ? <p>{ub.loadingUsers}</p> : null}
    {error ? <div><p>{ub.failedToLoadUsers}</p><button className="btn-ghost" onClick={() => void loadUsers()}>{ub.retry}</button></div> : null}
    {status ? <p>{status}</p> : null}
    {!loading && !error ? <table><thead><tr><th></th><th>{ub.user}</th><th>{ub.email}</th><th>{ub.balance}</th><th>{ub.commissionStatus}</th><th>{ub.customMarkup}</th><th>{ub.close}</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={7}>{ub.noUsers}</td></tr> : rows.map((row) => <tr key={row.userId}><td><input type="checkbox" checked={selected.has(row.userId)} onChange={() => toggleUser(row.userId)} /></td><td>{row.displayName ?? row.userId}</td><td>{row.email}</td><td>{row.balanceKopecks / 100} {row.walletCurrency}</td><td>{row.aiPlatformFeeExempt ? ub.platformFeeExempt : ub.standardCommission}</td><td>{row.aiMarkupPercentOverride ?? '—'}</td><td><button className="btn-ghost" onClick={() => { setSelected(new Set([row.userId])); setDirection('credit'); }}>{ub.credit}</button><button className="btn-ghost" onClick={() => { setSelected(new Set([row.userId])); setDirection('debit'); }}>{ub.debit}</button><button className="btn-ghost" onClick={() => startEdit(row)}>{ub.editCommission}</button><button className="btn-ghost" onClick={() => void clearOverride(row.userId)}>{ub.clearOverride}</button></td></tr>)}</tbody></table> : null}
    <div className="panel" style={{ display: 'grid', gap: 8 }}><h3>{ub.manualAdjustments}</h3><label>{ub.targetMode}<select value={targetMode} onChange={(e) => setTargetMode(e.target.value as any)}><option value="selected_users">{ub.selectedUsers}</option><option value="all_users">{ub.allUsers}</option></select></label><label>{ub.direction}<select value={direction} onChange={(e) => setDirection(e.target.value as any)}><option value="credit">{ub.credit}</option><option value="debit">{ub.debit}</option></select></label><label>{ub.amountRub}<input value={amountRub} onChange={(e) => setAmountRub(e.target.value)} /></label><label>{ub.reason}<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>{targetMode === 'all_users' ? <label>{ub.confirmation}<input value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} /><small>{ub.confirmationHint}</small></label> : null}{direction === 'debit' ? <small>{ub.debitWarning}</small> : null}<button className="btn-primary" disabled={!canSubmit} onClick={() => void submitAdjustment()}>{saving ? ub.applyingAdjustment : ub.applyAdjustment}</button></div>
    {editingUserId ? <div className="panel" style={{ display: 'grid', gap: 8 }}><h3>{ub.commissionOverrides}</h3><label><input type="checkbox" checked={overrideFeeExempt} onChange={(e) => setOverrideFeeExempt(e.target.checked)} /> {ub.platformFeeExempt}</label><label>{ub.customMarkupPercent}<input value={overrideMarkup} onChange={(e) => setOverrideMarkup(e.target.value)} /></label><small>{ub.customMarkupHelp}</small><small>{ub.providerCostStillCharged}</small><label>{ub.overrideReason}<textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} /></label><div><button className="btn-primary" onClick={() => void saveOverride()}>{ub.saveOverride}</button><button className="btn-ghost" onClick={() => setEditingUserId(null)}>{ub.cancel}</button><button className="btn-ghost" onClick={() => void clearOverride(editingUserId)}>{ub.clearOverride}</button></div></div> : null}
  </section>;
}
