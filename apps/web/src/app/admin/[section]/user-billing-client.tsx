'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePreferences } from '../../../lib/preferences';
import type { AdminBillingUserRow, AdminBillingUsersPayload } from '@quizmind/contracts';

const ALL_USERS_CONFIRMATION = 'CREDIT ALL USERS';

type ActionPanelMode = 'adjustment' | 'commission';

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
  const [statusTone, setStatusTone] = useState<'success' | 'error' | 'warning'>('success');
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [overrideFeeExempt, setOverrideFeeExempt] = useState(false);
  const [overrideMarkup, setOverrideMarkup] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [panelMode, setPanelMode] = useState<ActionPanelMode>('adjustment');

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
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.userId)), [rows, selected]);
  const singleSelectedRow = selectedRows.length === 1 ? selectedRows[0] : null;
  const canResetSelectedRule = selectedRows.length === 1 && (selectedRows[0].aiPlatformFeeExempt || selectedRows[0].aiMarkupPercentOverride != null);

  function toggleUser(userId: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(userId)) next.delete(userId); else next.add(userId); return next; });
  }

  function setStatusMessage(message: string, tone: 'success' | 'error' | 'warning') {
    setStatus(message);
    setStatusTone(tone);
  }

  function openManage(row: AdminBillingUserRow) {
    setSelected(new Set([row.userId]));
    setTargetMode('selected_users');
    setPanelMode('adjustment');
  }

  async function submitAdjustment() {
    if (!canSubmit) {
      if (!amountValid) setStatusMessage(ub.amountRequired, 'warning'); else if (!reasonValid) setStatusMessage(ub.reasonRequired, 'warning'); else if (targetMode === 'selected_users') setStatusMessage(ub.selectUsersFirst, 'warning'); else setStatusMessage(ub.confirmationRequired, 'warning');
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
    if (!res.ok || !body?.ok) { setStatusMessage(ub.failedToApplyAdjustment, 'error'); setSaving(false); return; }
    setStatusMessage(ub.adjustmentApplied.replace('{count}', String(body.data?.affectedCount ?? 0)), 'success');
    setAmountRub(''); setReason(''); setConfirmationText('');
    await loadUsers();
    setSaving(false);
  }

  function startEdit(row: AdminBillingUserRow) {
    setSelected(new Set([row.userId]));
    setEditingUserId(row.userId); setOverrideFeeExempt(row.aiPlatformFeeExempt); setOverrideMarkup(row.aiMarkupPercentOverride == null ? '' : String(row.aiMarkupPercentOverride)); setOverrideReason(row.billingOverrideReason ?? '');
    setPanelMode('commission');
  }
  async function clearOverride(userId: string) {
    if (!confirm(ub.resetRuleConfirm)) return;
    const res = await fetch(`/bff/admin/billing/users/${encodeURIComponent(userId)}/override`, { method: 'DELETE' });
    setStatusMessage(res.ok ? ub.overrideCleared : ub.failedToClearOverride, res.ok ? 'success' : 'error'); if (res.ok) await loadUsers();
  }
  async function saveOverride() {
    if (!editingUserId) return;
    if (overrideReason.trim().length < 5) { setStatusMessage(ub.reasonRequired, 'warning'); return; }
    const parsed = overrideMarkup.trim() === '' ? null : Number(overrideMarkup);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 500)) { setStatusMessage(ub.failedToSaveOverride, 'error'); return; }
    const res = await fetch(`/bff/admin/billing/users/${encodeURIComponent(editingUserId)}/override`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aiPlatformFeeExempt: overrideFeeExempt, aiMarkupPercentOverride: parsed, reason: overrideReason.trim() }) });
    setStatusMessage(res.ok ? ub.overrideSaved : ub.failedToSaveOverride, res.ok ? 'success' : 'error'); if (res.ok) { setEditingUserId(null); await loadUsers(); }
  }

  return <section className="panel" style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><h2 style={{ margin: 0 }}>{ub.title}</h2><p style={{ margin: '6px 0 0' }}>{ub.description}</p></div><button className="btn-ghost" onClick={() => void loadUsers()}>{ub.refresh}</button></div>
    <label style={{ display: 'grid', gap: 6 }}><span className="micro-label">{ub.searchUsers}</span><input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    {selected.size > 0 ? <div className="ub-toolbar"><strong>{selectedRows.length === 1 ? ub.selectedOne.replace('{name}', selectedRows[0].displayName ?? selectedRows[0].userId) : ub.selectedMany.replace('{count}', String(selectedRows.length))}</strong><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button className="btn-ghost" onClick={() => { setTargetMode('selected_users'); setDirection('credit'); setPanelMode('adjustment'); }}>{ub.credit}</button><button className="btn-ghost" onClick={() => { setTargetMode('selected_users'); setDirection('debit'); setPanelMode('adjustment'); }}>{ub.debit}</button><button className="btn-ghost" disabled={selectedRows.length !== 1} onClick={() => { if (singleSelectedRow) startEdit(singleSelectedRow); }}>{ub.editCommission}</button><button className="btn-ghost" disabled={!canResetSelectedRule} onClick={() => { if (singleSelectedRow) void clearOverride(singleSelectedRow.userId); }}>{ub.clearOverride}</button></div></div> : null}
    {loading ? <div className="ub-callout ub-callout-warning">{ub.loadingUsers}</div> : null}
    {error ? <div className="ub-callout ub-callout-error"><p>{ub.failedToLoadUsers}</p><button className="btn-ghost" onClick={() => void loadUsers()}>{ub.retry}</button></div> : null}
    {status ? <div className={`ub-callout ${statusTone === 'success' ? 'ub-callout-success' : statusTone === 'warning' ? 'ub-callout-warning' : 'ub-callout-error'}`}>{status}</div> : null}
    {!loading && !error ? <table><thead><tr><th></th><th>{ub.user}</th><th>{ub.email}</th><th>{ub.balance}</th><th>{ub.commissionStatus}</th><th>{ub.actions}</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={6}>{ub.noUsers}</td></tr> : rows.map((row) => <tr key={row.userId}><td><input type="checkbox" checked={selected.has(row.userId)} onChange={() => toggleUser(row.userId)} /></td><td>{row.displayName ?? row.userId}</td><td>{row.email}</td><td>{row.balanceKopecks / 100} {row.walletCurrency}</td><td><span className="ub-badge">{row.aiPlatformFeeExempt ? ub.platformFeeExemptBadge : row.aiMarkupPercentOverride != null ? ub.customMarkupBadge.replace('{value}', String(row.aiMarkupPercentOverride)) : ub.standardCommission}</span></td><td><button className="btn-ghost" onClick={() => openManage(row)}>{ub.manage}</button></td></tr>)}</tbody></table> : null}
    {panelMode === 'adjustment' ? <div className="panel" style={{ display: 'grid', gap: 8 }}><h3>{ub.manualAdjustments}</h3><p>{ub.manualAdjustmentsSubtitle}</p><label>{ub.targetMode}<select value={targetMode} onChange={(e) => setTargetMode(e.target.value as any)}><option value="selected_users">{ub.selectedUsers}</option><option value="all_users">{ub.allUsers}</option></select></label><label>{ub.direction}<select value={direction} onChange={(e) => setDirection(e.target.value as any)}><option value="credit">{ub.credit}</option><option value="debit">{ub.debit}</option></select></label><label>{ub.amountRub}<input value={amountRub} onChange={(e) => setAmountRub(e.target.value)} /></label><label>{ub.reason}<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label><div className="ub-callout ub-callout-warning"><div>{ub.previewSelected.replace('{count}', String(targetMode === 'all_users' ? rows.length : selected.size))}</div><div>{ub.previewOperation}: {direction === 'credit' ? ub.credit : ub.debit}</div><div>{ub.previewAmount.replace('{value}', amountRub || '0')}</div><div>{ub.previewReasonRequired}</div></div>{targetMode === 'all_users' ? <label>{ub.confirmation}<input value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} /><small>{ub.confirmationHint}</small></label> : null}{targetMode === 'all_users' ? <div className="ub-callout ub-callout-error">{ub.allUsersWarning}</div> : null}{direction === 'debit' ? <div className="ub-callout ub-callout-warning">{ub.debitWarning}</div> : null}<button className="btn-primary" disabled={!canSubmit} onClick={() => void submitAdjustment()}>{saving ? ub.applyingAdjustment : ub.applyAdjustment}</button></div> : null}
    {(panelMode === 'commission' && singleSelectedRow) ? <div className="panel" style={{ display: 'grid', gap: 8 }}><h3>{ub.commissionOverrides.replace('{userName}', singleSelectedRow.displayName ?? singleSelectedRow.userId)}</h3><p>{ub.providerCostStillCharged}</p><div className="ub-callout ub-callout-warning">{singleSelectedRow.aiPlatformFeeExempt ? ub.platformFeeExemptBadge : singleSelectedRow.aiMarkupPercentOverride != null ? ub.customMarkupBadge.replace('{value}', String(singleSelectedRow.aiMarkupPercentOverride)) : ub.standardCommission}</div><label><input type="checkbox" checked={overrideFeeExempt} onChange={(e) => setOverrideFeeExempt(e.target.checked)} /> {ub.platformFeeExempt}</label><label>{ub.customMarkupPercent}<input value={overrideMarkup} onChange={(e) => setOverrideMarkup(e.target.value)} /></label><label>{ub.overrideReason}<textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} /></label><div><button className="btn-primary" onClick={() => void saveOverride()}>{ub.saveOverride}</button><button className="btn-ghost" onClick={() => setPanelMode('adjustment')}>{ub.cancel}</button>{(singleSelectedRow.aiPlatformFeeExempt || singleSelectedRow.aiMarkupPercentOverride != null) ? <button className="btn-ghost ub-danger" onClick={() => void clearOverride(singleSelectedRow.userId)}>{ub.clearOverride}</button> : null}</div></div> : null}
  </section>;
}
