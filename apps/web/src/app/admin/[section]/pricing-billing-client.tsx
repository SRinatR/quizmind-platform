'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type PlatformAiPricingPolicySnapshot, type PlatformAiPricingPolicyUpdateRequest } from '@quizmind/contracts';

import type { ExchangeRateSnapshot } from '../../../lib/exchange-rates';
import { type BalanceDisplayCurrency, usePreferences } from '../../../lib/preferences';
import {
  convertDisplayCurrencyToUsd,
  convertUsdToDisplayCurrency,
  formatDisplayCurrencyAmount,
} from '../../../lib/money';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

interface PricingBillingAdminClientProps {
  exchangeRates: ExchangeRateSnapshot | null;
}

interface MoneyDraft {
  minimumFee: string;
  rounding: string;
  maxCharge: string;
}

const AI_PRICING_SETTINGS_ENDPOINT = '/bff/admin/settings/ai-pricing';
type PricingPolicy = PlatformAiPricingPolicySnapshot['policy'];
const PRICING_DEFAULTS: PricingPolicy = {
  enabled: false,
  markupPercent: 20,
  minimumFeeUsd: 0.0005,
  roundingUsd: 0.000001,
  maxChargeUsd: null,
  chargeFailedRequests: 'never',
  chargeUserKeyRequests: 'platform_fee_only',
  displayEstimatedPriceToUser: true,
};
const PRICING_DEFAULT_POLICY: PricingPolicy = PRICING_DEFAULTS;

function parseEnvelope<T>(value: unknown): ApiEnvelope<T> | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as ApiEnvelope<T>;
  if (typeof candidate.ok !== 'boolean') return null;
  return candidate;
}

function toRequestErrorMessage(responseStatus: number, fallback: string) {
  if (responseStatus === 401) return 'authSignIn';
  if (responseStatus === 403) return 'authForbidden';
  if (responseStatus === 404) return 'endpointMissing';
  if (responseStatus >= 500) return 'serviceUnavailable';
  return fallback;
}

function parseNumberish(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatInputValue(value: number, fractionDigits = 8): string {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(fractionDigits).replace(/\.?0+$/, '');
}

function toMoneyDraft(policy: PlatformAiPricingPolicySnapshot['policy'], currency: BalanceDisplayCurrency, exchangeRates: ExchangeRateSnapshot | null): MoneyDraft {
  const minDisplay = convertUsdToDisplayCurrency(policy.minimumFeeUsd, currency, exchangeRates);
  const roundingDisplay = convertUsdToDisplayCurrency(policy.roundingUsd, currency, exchangeRates);
  const maxDisplay = policy.maxChargeUsd == null ? null : convertUsdToDisplayCurrency(policy.maxChargeUsd, currency, exchangeRates);

  return {
    minimumFee: minDisplay == null ? '' : formatInputValue(minDisplay),
    rounding: roundingDisplay == null ? '' : formatInputValue(roundingDisplay),
    maxCharge: maxDisplay == null ? '' : formatInputValue(maxDisplay),
  };
}

function moneySymbol(currency: BalanceDisplayCurrency): string {
  if (currency === 'RUB') return '₽';
  if (currency === 'EUR') return '€';
  return '$';
}

export function PricingBillingAdminClient({ exchangeRates }: PricingBillingAdminClientProps) {
  const { t, prefs } = usePreferences();
  const pricingT = t.admin.settings.pricing;
  function resolveErrorMessage(statusCode: number, fallbackKey: 'loadFailed' | 'saveFailed', payloadMessage?: string): string {
    if (payloadMessage) return payloadMessage;
    const key = toRequestErrorMessage(statusCode, fallbackKey);
    return pricingT[key as keyof typeof pricingT] as string;
  }

  const [state, setState] = useState<PlatformAiPricingPolicySnapshot | null>(null);
  const [draft, setDraft] = useState<PlatformAiPricingPolicyUpdateRequest>({});
  const [moneyDraft, setMoneyDraft] = useState<MoneyDraft>({ minimumFee: '', rounding: '', maxCharge: '' });
  const [status, setStatus] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currency = prefs.balanceDisplayCurrency;
  const currencySymbol = moneySymbol(currency);
  const currencyConversionUnavailable = useMemo(() => {
    if (currency === 'USD') return false;
    return !exchangeRates || !Number.isFinite(exchangeRates.USD) || !Number.isFinite(exchangeRates.EUR) || exchangeRates.USD <= 0 || exchangeRates.EUR <= 0;
  }, [currency, exchangeRates]);

  const loadPricingSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const res = await fetch(AI_PRICING_SETTINGS_ENDPOINT, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as unknown;
      const payload = parseEnvelope<PlatformAiPricingPolicySnapshot>(json);

      if (!res.ok || !payload?.ok || !payload.data) {
        setState(null);
        setError(resolveErrorMessage(res.status, 'loadFailed', payload?.error?.message));
        return;
      }

      setState(payload.data);
      setDraft(payload.data.policy);
      setMoneyDraft(toMoneyDraft(payload.data.policy, currency, exchangeRates));
    } catch {
      setState(null);
      setError(pricingT.loadRetry);
    } finally {
      setLoading(false);
    }
  }, [currency, exchangeRates, pricingT]);

  useEffect(() => {
    void loadPricingSettings();
  }, [loadPricingSettings]);

  useEffect(() => {
    if (!state) return;
    setMoneyDraft(toMoneyDraft(state.policy, currency, exchangeRates));
  }, [currency, exchangeRates, state]);

  const draftWithDefaults = useMemo<PricingPolicy>(() => ({
    ...PRICING_DEFAULTS,
    ...draft,
    maxChargeUsd: draft.maxChargeUsd ?? null,
  }), [draft]);

  const isDirty = useMemo(() => {
    if (!state) return false;
    const normalizedDraft = {
      ...PRICING_DEFAULTS,
      ...draft,
      maxChargeUsd: draft.maxChargeUsd ?? null,
    };
    const normalizedState = {
      ...PRICING_DEFAULTS,
      ...state.policy,
      maxChargeUsd: state.policy.maxChargeUsd ?? null,
    };
    return JSON.stringify(normalizedDraft) !== JSON.stringify(normalizedState);
  }, [draft, state]);

  const preview = useMemo(() => {
    const providerCostUsd = 0.002;
    const providerCostDisplay = convertUsdToDisplayCurrency(providerCostUsd, currency, exchangeRates);
    const markupPercent = draftWithDefaults.markupPercent;
    const minimumFeeUsd = draftWithDefaults.minimumFeeUsd;
    const basePlatformFeeUsd = providerCostUsd * (markupPercent / 100);
    const platformFeeUsd = Math.max(basePlatformFeeUsd, minimumFeeUsd);
    const uncappedUsd = providerCostUsd + platformFeeUsd;
    const maxChargeUsd = draftWithDefaults.maxChargeUsd;
    const cappedUsd = maxChargeUsd == null ? uncappedUsd : Math.min(uncappedUsd, maxChargeUsd);
    const stepUsd = draftWithDefaults.roundingUsd;
    const finalChargeUsd = stepUsd > 0 ? Math.ceil(cappedUsd / stepUsd) * stepUsd : cappedUsd;

    return {
      providerCost: formatDisplayCurrencyAmount(providerCostDisplay ?? providerCostUsd, providerCostDisplay == null ? 'USD' : currency),
      platformFee: formatDisplayCurrencyAmount(
        convertUsdToDisplayCurrency(platformFeeUsd, currency, exchangeRates) ?? platformFeeUsd,
        convertUsdToDisplayCurrency(platformFeeUsd, currency, exchangeRates) == null ? 'USD' : currency,
      ),
      finalCharge: formatDisplayCurrencyAmount(
        convertUsdToDisplayCurrency(finalChargeUsd, currency, exchangeRates) ?? finalChargeUsd,
        convertUsdToDisplayCurrency(finalChargeUsd, currency, exchangeRates) == null ? 'USD' : currency,
      ),
      formula: `${pricingT.formulaProviderCost} + ${pricingT.formulaPlatformFee} = ${pricingT.formulaFinalCharge}`,
    };
  }, [currency, draftWithDefaults, exchangeRates, pricingT]);

  function patchMoneyField(field: keyof Pick<PlatformAiPricingPolicyUpdateRequest, 'minimumFeeUsd' | 'roundingUsd' | 'maxChargeUsd'>, value: string) {
    setValidationError(null);
    setStatus(null);

    if (field === 'maxChargeUsd') {
      setMoneyDraft((prev) => ({ ...prev, maxCharge: value }));
      if (value.trim() === '') {
        setDraft((prev) => ({ ...prev, maxChargeUsd: null }));
        return;
      }
    } else if (field === 'minimumFeeUsd') {
      setMoneyDraft((prev) => ({ ...prev, minimumFee: value }));
    } else {
      setMoneyDraft((prev) => ({ ...prev, rounding: value }));
    }

    const parsed = parseNumberish(value);
    if (parsed === null) {
      return;
    }

    const convertedUsd = convertDisplayCurrencyToUsd(parsed, currency, exchangeRates);
    if (convertedUsd === null) {
      return;
    }

    setDraft((prev) => ({ ...prev, [field]: convertedUsd }));
  }

  function validateDraft(): string | null {
    if ((draftWithDefaults.markupPercent ?? 0) < 0 || (draftWithDefaults.markupPercent ?? 0) > 500) return pricingT.validationMarkup;

    const moneyFields: Array<[string, number | null | undefined]> = [
      ['minimumFeeUsd', draftWithDefaults.minimumFeeUsd],
      ['roundingUsd', draftWithDefaults.roundingUsd],
      ['maxChargeUsd', draftWithDefaults.maxChargeUsd],
    ];

    for (const [field, value] of moneyFields) {
      if (value == null && field === 'maxChargeUsd') continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return pricingT.validationMoney;
    }

    if ((draftWithDefaults.roundingUsd ?? 0) <= 0) return pricingT.validationRounding;
    if (draftWithDefaults.maxChargeUsd != null && draftWithDefaults.maxChargeUsd <= 0) return pricingT.validationMaxCharge;
    return null;
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setStatus(null);

    const validation = validateDraft();
    if (validation) {
      setValidationError(validation);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(AI_PRICING_SETTINGS_ENDPOINT, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });

      const json = (await res.json().catch(() => null)) as unknown;
      const payload = parseEnvelope<PlatformAiPricingPolicySnapshot>(json);

      if (!res.ok || !payload?.ok || !payload.data) {
        setError(resolveErrorMessage(res.status, 'saveFailed', payload?.error?.message));
        return;
      }

      setState(payload.data);
      setDraft(payload.data.policy);
      setMoneyDraft(toMoneyDraft(payload.data.policy, currency, exchangeRates));
      setStatus(t.settings.account.savedMessage);
    } catch {
      setError(pricingT.saveRetry);
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (!state) return;
    setDraft(state.policy);
    setMoneyDraft(toMoneyDraft(state.policy, currency, exchangeRates));
    setValidationError(null);
    setError(null);
    setStatus(null);
  }

  function onResetDefaults() {
    setDraft(PRICING_DEFAULT_POLICY);
    setMoneyDraft(toMoneyDraft(PRICING_DEFAULT_POLICY, currency, exchangeRates));
    setValidationError(null);
    setStatus(null);
  }

  if (loading) return <section className="panel"><p>{pricingT.loading}</p></section>;
  if (!state) {
    return (
      <section className="panel" style={{ display: 'grid', gap: 10 }}>
        <p style={{ color: 'var(--danger)' }}>{error ?? pricingT.unableLoad}</p>
        <button className="btn-secondary" type="button" onClick={() => void loadPricingSettings()}>
          {pricingT.retry}
        </button>
      </section>
    );
  }

  return (
    <section className="pricing-page">
      <header className="pricing-card pricing-card__header">
        <h3 className="settings-section__title">{pricingT.title}</h3>
        <p className="settings-section__desc">{pricingT.desc}</p>
      </header>

      {status ? <div className="banner banner-success">{status}</div> : null}
      {error ? <div className="banner banner-error">{error}</div> : null}
      {validationError ? <div className="banner banner-error">{validationError}</div> : null}

      <article className="panel pricing-card">
        <div className="pricing-card__header">
          <h4 className="pricing-card__title">{pricingT.chargingTitle}</h4>
        </div>
        <label className="pricing-toggle-row">
          <span className="pricing-toggle-row__copy">
            <span className="pricing-field__label">{pricingT.enableCharging}</span>
            <span className="pricing-field__desc">{pricingT.enableChargingDesc}</span>
          </span>
          <span className="pricing-toggle-row__control">
            <input type="checkbox" checked={Boolean(draftWithDefaults.enabled)} onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))} />
          </span>
        </label>
        <div>
          <span className={`tag-soft ${draftWithDefaults.enabled ? 'tag-soft--green' : 'tag-soft--gray'}`}>
            {draftWithDefaults.enabled ? pricingT.statusEnabled : pricingT.statusDisabled}
          </span>
        </div>
        {draftWithDefaults.enabled ? <div className="pricing-callout pricing-callout--warning"><p>{pricingT.enabledWarning}</p></div> : null}
      </article>

      <article className="panel pricing-card">
        <div className="pricing-card__header">
          <h4 className="pricing-card__title">{pricingT.platformFeeTitle}</h4>
          <p className="pricing-card__desc">{pricingT.platformFeeDesc}</p>
        </div>
        <div className="pricing-field-grid">
          <label className="pricing-field">
            <span className="pricing-field__label">{pricingT.markupPercent}</span>
            <span className="pricing-field__desc">{pricingT.markupPercentDesc}</span>
            <input type="number" min={0} max={500} value={draftWithDefaults.markupPercent} onChange={(e) => setDraft((prev) => ({ ...prev, markupPercent: Number(e.target.value) }))} />
          </label>
          <label className="pricing-field">
            <span className="pricing-field__label">{pricingT.minimumFee}</span>
            <span className="pricing-field__desc">{pricingT.minimumFeeDesc}</span>
            <div className="pricing-input-with-suffix">
              <input type="number" min={0} step={0.000001} value={moneyDraft.minimumFee} disabled={currencyConversionUnavailable} onChange={(e) => patchMoneyField('minimumFeeUsd', e.target.value)} />
              <span>{currencySymbol}</span>
            </div>
          </label>
        </div>
      </article>

      <article className="panel pricing-card">
        <div className="pricing-card__header">
          <h4 className="pricing-card__title">{pricingT.limitsTitle}</h4>
          <p className="pricing-card__desc">{pricingT.limitsDesc}</p>
        </div>
        <div className="pricing-field-grid">
          <label className="pricing-field">
            <span className="pricing-field__label">{pricingT.roundTo}</span>
            <span className="pricing-field__desc">{pricingT.roundToDesc}</span>
            <div className="pricing-input-with-suffix">
              <input type="number" min={0.000001} step={0.000001} value={moneyDraft.rounding} disabled={currencyConversionUnavailable} onChange={(e) => patchMoneyField('roundingUsd', e.target.value)} />
              <span>{currencySymbol}</span>
            </div>
          </label>
          <label className="pricing-field">
            <span className="pricing-field__label">{pricingT.maxCharge}</span>
            <span className="pricing-field__desc">{pricingT.maxChargeDesc}</span>
            <div className="pricing-input-with-suffix">
              <input type="number" min={0.000001} step={0.000001} value={moneyDraft.maxCharge} disabled={currencyConversionUnavailable} onChange={(e) => patchMoneyField('maxChargeUsd', e.target.value)} placeholder={pricingT.emptyMeansNoCap} />
              <span>{currencySymbol}</span>
            </div>
          </label>
        </div>
      </article>

      <article className="panel pricing-card">
        <div className="pricing-card__header">
          <h4 className="pricing-card__title">{pricingT.failedRequestsTitle}</h4>
          <p className="pricing-card__desc">{pricingT.failedRequestsDesc}</p>
        </div>
        <select value={draftWithDefaults.chargeFailedRequests} onChange={(e) => setDraft((prev) => ({ ...prev, chargeFailedRequests: e.target.value as PlatformAiPricingPolicyUpdateRequest['chargeFailedRequests'] }))}>
          <option value="never">{pricingT.never}</option>
          <option value="provider_cost_only">{pricingT.providerCostOnly}</option>
          <option value="minimum_fee">{pricingT.minimumFeeOnly}</option>
        </select>
      </article>

      <article className="panel pricing-card">
        <div className="pricing-card__header">
          <h4 className="pricing-card__title">{pricingT.byokTitle}</h4>
          <p className="pricing-card__desc">{pricingT.byokDesc}</p>
        </div>
        <select value={draftWithDefaults.chargeUserKeyRequests} onChange={(e) => setDraft((prev) => ({ ...prev, chargeUserKeyRequests: e.target.value as PlatformAiPricingPolicyUpdateRequest['chargeUserKeyRequests'] }))}>
          <option value="never">{pricingT.never}</option>
          <option value="platform_fee_only">{pricingT.platformFeeOnly}</option>
          <option value="full_price">{pricingT.fullPrice}</option>
        </select>
      </article>

      <article className="panel pricing-card">
        <label className="pricing-toggle-row">
          <span className="pricing-toggle-row__copy">
            <span className="pricing-field__label">{pricingT.displayEstimate}</span>
            <span className="pricing-field__desc">{pricingT.displayEstimateDesc}</span>
          </span>
          <span className="pricing-toggle-row__control">
            <input type="checkbox" checked={Boolean(draftWithDefaults.displayEstimatedPriceToUser)} onChange={(e) => setDraft((prev) => ({ ...prev, displayEstimatedPriceToUser: e.target.checked }))} />
          </span>
        </label>
      </article>

      <article className="panel pricing-preview pricing-card">
        <div className="pricing-card__header">
          <h4 className="pricing-card__title">{pricingT.previewTitle}</h4>
          <p className="pricing-card__desc">{preview.formula}</p>
        </div>
        <dl>
          <div><dt>{pricingT.formulaProviderCost}</dt><dd>{preview.providerCost}</dd></div>
          <div><dt>{pricingT.formulaPlatformFee}</dt><dd>{preview.platformFee}</dd></div>
          <div><dt>{pricingT.formulaFinalCharge}</dt><dd>{preview.finalCharge}</dd></div>
        </dl>
      </article>

      <div className="retention-actions">
        <button className="btn-primary" disabled={saving || !isDirty} onClick={onSave}>{saving ? t.settings.account.saving : pricingT.save}</button>
        <button className="btn-ghost" type="button" disabled={!isDirty || saving} onClick={onCancel}>{pricingT.cancel}</button>
        <button className="btn-secondary" type="button" disabled={saving} onClick={onResetDefaults}>{pricingT.resetDefaults}</button>
      </div>

      <p className="pricing-field__desc">{pricingT.currencyStorageNote}</p>
      {currencyConversionUnavailable ? <div className="banner banner-warn">{pricingT.missingRate}</div> : null}
    </section>
  );
}
