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

  const setStatusMessage = (message: string, tone: 'success' | 'error' | 'warning') => {
    setStatus(message);
    setStatusTone(tone);
  };

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/bff/admin/billing/users${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; data?: AdminBillingUsersPayload } | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        setError(ub.failedToLoadUsers);
        return;
      }
      setItems(payload.data.items);
    } catch {
      setError(ub.networkError);
      setStatusMessage(ub.networkError, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const amount = Number(amountRub);
  const reasonValid = reason.trim().length >= 5;
  const selectionValid = targetMode === 'all_users' ? confirmationText === ALL_USERS_CONFIRMATION : selected.size > 0;
  const amountValid = Number.isFinite(amount) && amount > 0;
  const canSubmit = amountValid && reasonValid && selectionValid && !saving;
  const rows = useMemo(() => items, [items]);
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.userId)), [rows, selected]);
  const singleSelectedRow = selectedRows.length === 1 ? selectedRows[0] : null;
  const canResetSelectedRule = Boolean(singleSelectedRow && (singleSelectedRow.aiPlatformFeeExempt || singleSelectedRow.aiMarkupPercentOverride != null));

  function toggleUser(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  function openManage(row: AdminBillingUserRow) {
    setSelected(new Set([row.userId]));
    setTargetMode('selected_users');
    setPanelMode('adjustment');
  }

  function openAdjustment(nextDirection: 'credit' | 'debit') {
    setTargetMode('selected_users');
    setDirection(nextDirection);
    setPanelMode('adjustment');
  }

  function openCommissionRule(row: AdminBillingUserRow) {
    setSelected(new Set([row.userId]));
    setEditingUserId(row.userId);
    setOverrideFeeExempt(row.aiPlatformFeeExempt);
    setOverrideMarkup(row.aiMarkupPercentOverride == null ? '' : String(row.aiMarkupPercentOverride));
    setOverrideReason(row.billingOverrideReason ?? '');
    setPanelMode('commission');
  }

  async function submitAdjustment() {
    if (!canSubmit) {
      if (!amountValid) setStatusMessage(ub.amountRequired, 'warning');
      else if (!reasonValid) setStatusMessage(ub.reasonRequired, 'warning');
      else if (targetMode === 'selected_users') setStatusMessage(ub.selectUsersFirst, 'warning');
      else setStatusMessage(ub.confirmationRequired, 'warning');
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        target: targetMode === 'selected_users' ? { type: 'selected_users' as const, userIds: Array.from(selected) } : { type: 'all_users' as const, confirmationText },
        direction,
        amountKopecks: Math.round(amount * 100),
        currency: 'RUB' as const,
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      };
      const res = await fetch('/bff/admin/billing/wallet-adjustments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => null)) as any;
      if (!res.ok || !body?.ok) {
        setStatusMessage(ub.failedToApplyAdjustment, 'error');
        return;
      }
      setStatusMessage(ub.adjustmentApplied.replace('{count}', String(body.data?.affectedCount ?? 0)), 'success');
      setAmountRub('');
      setReason('');
      setConfirmationText('');
      await loadUsers();
    } catch {
      setStatusMessage(ub.networkError, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride(userId: string) {
    if (!confirm(ub.resetRuleConfirm)) return;
    try {
      const res = await fetch(`/bff/admin/billing/users/${encodeURIComponent(userId)}/override`, { method: 'DELETE' });
      setStatusMessage(res.ok ? ub.overrideCleared : ub.failedToClearOverride, res.ok ? 'success' : 'error');
      if (res.ok) await loadUsers();
    } catch {
      setStatusMessage(ub.networkError, 'error');
    }
  }

  async function saveOverride() {
    if (!editingUserId) return;
    if (overrideReason.trim().length < 5) {
      setStatusMessage(ub.reasonRequired, 'warning');
      return;
    }
    const parsed = overrideMarkup.trim() === '' ? null : Number(overrideMarkup);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 500)) {
      setStatusMessage(ub.failedToSaveOverride, 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/bff/admin/billing/users/${encodeURIComponent(editingUserId)}/override`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aiPlatformFeeExempt: overrideFeeExempt, aiMarkupPercentOverride: parsed, reason: overrideReason.trim() }),
      });
      setStatusMessage(res.ok ? ub.overrideSaved : ub.failedToSaveOverride, res.ok ? 'success' : 'error');
      if (res.ok) await loadUsers();
    } catch {
      setStatusMessage(ub.networkError, 'error');
    } finally {
      setSaving(false);
    }
  }

  const previewUsersCount = targetMode === 'all_users' ? rows.length : selected.size;

  return (
    <section className="panel user-billing-page">
      <div className="user-billing-header">
        <div>
          <h2>{ub.title}</h2>
          <p>{ub.description}</p>
        </div>
        <button className="btn-ghost" onClick={() => void loadUsers()}>{ub.refresh}</button>
      </div>

      <div className="user-billing-help ub-callout">
        <strong>{ub.howItWorksTitle}</strong>
        <ol>
          <li>{ub.howItWorksStep1}</li>
          <li>{ub.howItWorksStep2}</li>
          <li>{ub.howItWorksStep3}</li>
          <li>{ub.howItWorksStep4}</li>
        </ol>
      </div>

      <div className="user-billing-search">
        <label>
          <span className="micro-label">{ub.searchUsers}</span>
          <input value={search} onKeyDown={(e) => { if (e.key === 'Enter') void loadUsers(); }} onChange={(e) => setSearch(e.target.value)} placeholder={ub.searchHint} />
        </label>
        <button className="btn-ghost" onClick={() => void loadUsers()}>{ub.search}</button>
      </div>

      {selected.size > 0 ? (
        <div className="ub-toolbar user-billing-selection-panel">
          {singleSelectedRow ? (
            <div className="user-billing-context">
              <span className="micro-label">{ub.selectedUser}</span>
              <strong>{singleSelectedRow.displayName ?? singleSelectedRow.userId}</strong>
              <span className="muted">{singleSelectedRow.email}</span>
              <span>{ub.selectedUserBalance.replace('{amount}', String(singleSelectedRow.balanceKopecks / 100)).replace('{currency}', singleSelectedRow.walletCurrency)}</span>
              <span className="ub-badge">{singleSelectedRow.aiPlatformFeeExempt ? ub.platformFeeExemptBadge : singleSelectedRow.aiMarkupPercentOverride != null ? ub.customMarkupBadge.replace('{value}', String(singleSelectedRow.aiMarkupPercentOverride)) : ub.standardCommission}</span>
            </div>
          ) : (
            <div className="user-billing-context">
              <strong>{ub.selectedMany.replace('{count}', String(selectedRows.length))}</strong>
              <span className="muted">{ub.singleUserCommissionHint}</span>
            </div>
          )}
          <div className="user-billing-actions">
            <button className="btn-ghost" onClick={() => openAdjustment('credit')}>{ub.credit}</button>
            <button className="btn-ghost" onClick={() => openAdjustment('debit')}>{ub.debit}</button>
            <button className="btn-ghost" disabled={!singleSelectedRow} onClick={() => { if (singleSelectedRow) openCommissionRule(singleSelectedRow); }}>{ub.editCommission}</button>
            {canResetSelectedRule && singleSelectedRow ? <button className="btn-ghost ub-danger" onClick={() => void clearOverride(singleSelectedRow.userId)}>{ub.clearOverride}</button> : null}
          </div>
        </div>
      ) : null}

      {loading ? <div className="ub-callout ub-callout-warning">{ub.loadingUsers}</div> : null}
      {error ? <div className="ub-callout ub-callout-error"><p>{error}</p><button className="btn-ghost" onClick={() => void loadUsers()}>{ub.retry}</button></div> : null}
      {status ? <div className={`ub-callout ${statusTone === 'success' ? 'ub-callout-success' : statusTone === 'warning' ? 'ub-callout-warning' : 'ub-callout-error'}`}>{status}</div> : null}

      {!loading && !error ? (
        <div className="user-billing-table-wrap">
          <table>
            <thead>
              <tr><th></th><th>{ub.user}</th><th>{ub.balance}</th><th>{ub.commissionStatus}</th><th>{ub.actions}</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={5}>{ub.noUsers}</td></tr> : rows.map((row) => (
                <tr key={row.userId} className={selected.has(row.userId) ? 'user-billing-row-selected' : ''}>
                  <td><input type="checkbox" checked={selected.has(row.userId)} onChange={() => toggleUser(row.userId)} /></td>
                  <td><div>{row.displayName ?? row.userId}</div><div className="muted">{row.email}</div></td>
                  <td>{row.balanceKopecks / 100} {row.walletCurrency}</td>
                  <td><span className="ub-badge">{row.aiPlatformFeeExempt ? ub.platformFeeExemptBadge : row.aiMarkupPercentOverride != null ? ub.customMarkupBadge.replace('{value}', String(row.aiMarkupPercentOverride)) : ub.standardCommission}</span></td>
                  <td><button className="btn-ghost btn-compact" onClick={() => openManage(row)}>{ub.manage}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="user-billing-action-tabs">
        <button className={`btn-ghost ${panelMode === 'adjustment' ? 'is-active' : ''}`} onClick={() => setPanelMode('adjustment')}>{ub.balanceAdjustmentTitle}</button>
        <button className={`btn-ghost ${panelMode === 'commission' ? 'is-active' : ''}`} disabled={!singleSelectedRow} onClick={() => { if (singleSelectedRow) openCommissionRule(singleSelectedRow); }}>{ub.editCommission}</button>
      </div>

      <div className="user-billing-main-grid">
        {panelMode === 'adjustment' ? (
          <div className="panel user-billing-form-grid">
            <h3>{ub.balanceAdjustmentTitle}</h3><p>{ub.balanceAdjustmentSubtitle}</p>
            <label>{ub.targetMode}<select value={targetMode} onChange={(e) => setTargetMode(e.target.value as 'selected_users' | 'all_users')}><option value="selected_users">{ub.selectedUsers}</option><option value="all_users">{ub.allUsers}</option></select></label>
            <label>{ub.direction}<select value={direction} onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')}><option value="credit">{ub.credit}</option><option value="debit">{ub.debit}</option></select></label>
            <label>{ub.amountRub}<input value={amountRub} onChange={(e) => setAmountRub(e.target.value)} /></label>
            <label>{ub.reason}<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            {targetMode === 'all_users' ? <label>{ub.confirmation}<input value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} /><small>{ub.confirmationHint}</small></label> : null}
            <div className="ub-callout user-billing-preview">
              <strong>{ub.previewTitle}</strong>
              <div>{ub.previewSelected.replace('{count}', String(previewUsersCount))}</div>
              <div>{ub.previewOperation}: {direction === 'credit' ? ub.credit : ub.debit}</div>
              <div>{ub.previewAmountSigned.replace('{value}', amountRub || '0').replace('{sign}', direction === 'credit' ? '+' : '-')}</div>
              <div>{ub.previewLedgerEntry}</div>
              <div>{ub.previewYookassaPayment}</div>
            </div>
            {direction === 'debit' ? <div className="ub-callout ub-callout-warning">{ub.debitWarning}</div> : null}
            {targetMode === 'all_users' ? <div className="ub-callout ub-callout-error user-billing-danger">{ub.allUsersWarning}</div> : null}
            <button className="btn-primary" disabled={!canSubmit} onClick={() => void submitAdjustment()}>{saving ? ub.applyingAdjustment : ub.applyAdjustment}</button>
          </div>
        ) : null}

        {panelMode === 'commission' && singleSelectedRow ? (
          <div className="panel user-billing-form-grid">
            <h3>{ub.editCommission}</h3>
            <div className="user-billing-context">
              <strong>{singleSelectedRow.displayName ?? singleSelectedRow.userId}</strong>
              <span className="muted">{singleSelectedRow.email}</span>
              <span>{ub.selectedUserBalance.replace('{amount}', String(singleSelectedRow.balanceKopecks / 100)).replace('{currency}', singleSelectedRow.walletCurrency)}</span>
              <span className="ub-badge">{singleSelectedRow.aiPlatformFeeExempt ? ub.platformFeeExemptBadge : singleSelectedRow.aiMarkupPercentOverride != null ? ub.customMarkupBadge.replace('{value}', String(singleSelectedRow.aiMarkupPercentOverride)) : ub.standardCommission}</span>
            </div>
            <div className="ub-callout">{ub.providerCostStillCharged}</div>
            <label><input type="checkbox" checked={overrideFeeExempt} onChange={(e) => setOverrideFeeExempt(e.target.checked)} /> {ub.platformFeeExempt}</label>
            <label>{ub.customMarkupPercent}<input value={overrideMarkup} onChange={(e) => setOverrideMarkup(e.target.value)} /></label>
            <label>{ub.overrideReason}<textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} /></label>
            <div>
              <button className="btn-primary" disabled={saving || !editingUserId || overrideReason.trim().length < 5} onClick={() => void saveOverride()}>{saving ? ub.savingOverride : ub.saveOverride}</button>
              <button className="btn-ghost" onClick={() => setPanelMode('adjustment')}>{ub.cancel}</button>
              {(singleSelectedRow.aiPlatformFeeExempt || singleSelectedRow.aiMarkupPercentOverride != null) ? <button className="btn-ghost ub-danger" onClick={() => void clearOverride(singleSelectedRow.userId)}>{ub.clearOverrideToGlobal}</button> : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
