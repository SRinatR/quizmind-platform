'use client';

import { useCallback, useEffect, useState } from 'react';
import { type PlatformAiPricingPolicySnapshot, type PlatformAiPricingPolicyUpdateRequest } from '@quizmind/contracts';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

const AI_PRICING_SETTINGS_ENDPOINT = '/bff/admin/settings/ai-pricing';

function parseEnvelope<T>(value: unknown): ApiEnvelope<T> | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as ApiEnvelope<T>;
  if (typeof candidate.ok !== 'boolean') return null;
  return candidate;
}

function toRequestErrorMessage(responseStatus: number, fallback: string, payloadMessage?: string) {
  if (payloadMessage) return payloadMessage;
  if (responseStatus === 401) return 'Sign in to access AI pricing settings.';
  if (responseStatus === 403) return 'You do not have permission to access AI pricing settings.';
  if (responseStatus === 404) return 'AI pricing settings endpoint was not found.';
  if (responseStatus >= 500) return 'AI pricing settings are temporarily unavailable.';
  return fallback;
}

export function PricingBillingAdminClient() {
  const [state, setState] = useState<PlatformAiPricingPolicySnapshot | null>(null);
  const [draft, setDraft] = useState<PlatformAiPricingPolicyUpdateRequest>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPricingSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(AI_PRICING_SETTINGS_ENDPOINT, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as unknown;
      const payload = parseEnvelope<PlatformAiPricingPolicySnapshot>(json);

      if (!res.ok || !payload?.ok || !payload.data) {
        setState(null);
        setError(toRequestErrorMessage(res.status, 'Failed to load pricing settings.', payload?.error?.message));
        return;
      }

      setState(payload.data);
      setDraft(payload.data.policy);
    } catch {
      setState(null);
      setError('Failed to load pricing settings. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPricingSettings();
  }, [loadPricingSettings]);

  async function onSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(AI_PRICING_SETTINGS_ENDPOINT, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });

      const json = (await res.json().catch(() => null)) as unknown;
      const payload = parseEnvelope<PlatformAiPricingPolicySnapshot>(json);

      if (!res.ok || !payload?.ok || !payload.data) {
        setError(toRequestErrorMessage(res.status, 'Failed to save pricing settings.', payload?.error?.message));
        return;
      }

      setState(payload.data);
      setDraft(payload.data.policy);
    } catch {
      setError('Failed to save pricing settings. Please retry.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="panel"><p>Loading pricing & billing settings…</p></section>;
  if (!state) {
    return (
      <section className="panel" style={{ display: 'grid', gap: 10 }}>
        <p style={{ color: 'var(--danger)' }}>{error ?? 'Unable to load pricing settings.'}</p>
        <button className="btn-secondary" type="button" onClick={() => void loadPricingSettings()}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="panel" style={{ display: 'grid', gap: 14 }}>
      <h3>AI Request Pricing</h3>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <label><input type="checkbox" checked={Boolean(draft.enabled)} onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))} /> Enable AI request charging</label>
      <label>Platform markup percent <input type="number" min={0} max={500} value={draft.markupPercent ?? 0} onChange={(e) => setDraft((prev) => ({ ...prev, markupPercent: Number(e.target.value) }))} /></label>
      <label>Minimum platform fee per request <input type="number" min={0} max={1} step={0.000001} value={draft.minimumFeeUsd ?? 0} onChange={(e) => setDraft((prev) => ({ ...prev, minimumFeeUsd: Number(e.target.value) }))} /></label>
      <label>Round charged amount to <input type="number" min={0.000001} max={0.01} step={0.000001} value={draft.roundingUsd ?? 0.000001} onChange={(e) => setDraft((prev) => ({ ...prev, roundingUsd: Number(e.target.value) }))} /></label>
      <label>Maximum charge per request <input type="number" min={0.000001} max={100} step={0.000001} value={draft.maxChargeUsd ?? ''} onChange={(e) => setDraft((prev) => ({ ...prev, maxChargeUsd: e.target.value === '' ? null : Number(e.target.value) }))} /></label>
      <label><input type="checkbox" checked={Boolean(draft.displayEstimatedPriceToUser)} onChange={(e) => setDraft((prev) => ({ ...prev, displayEstimatedPriceToUser: e.target.checked }))} /> Display estimated price to user</label>

      <h3>Failure behavior</h3>
      <select value={draft.chargeFailedRequests ?? 'never'} onChange={(e) => setDraft((prev) => ({ ...prev, chargeFailedRequests: e.target.value as PlatformAiPricingPolicyUpdateRequest['chargeFailedRequests'] }))}>
        <option value="never">never</option>
        <option value="provider_cost_only">provider cost only</option>
        <option value="minimum_fee">minimum fee</option>
      </select>

      <h3>User API key / BYOK behavior</h3>
      <select value={draft.chargeUserKeyRequests ?? 'platform_fee_only'} onChange={(e) => setDraft((prev) => ({ ...prev, chargeUserKeyRequests: e.target.value as PlatformAiPricingPolicyUpdateRequest['chargeUserKeyRequests'] }))}>
        <option value="never">never</option>
        <option value="platform_fee_only">platform fee only</option>
        <option value="full_price">full price</option>
      </select>

      <article className="panel" style={{ background: 'var(--panel-elevated)' }}>
        <strong>Formula</strong>
        <p>Provider cost + platform fee = user charge.</p>
        <p>Provider cost uses real response.usage.cost when available, otherwise token-price estimate.</p>
      </article>

      <button className="btn-primary" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save pricing settings'}</button>
    </section>
  );
}
