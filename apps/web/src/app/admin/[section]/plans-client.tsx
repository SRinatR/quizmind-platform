'use client';

import {
  type BillingAdminPlanEntitlementInput,
  type BillingAdminPlanPriceInput,
  type BillingAdminPlanSnapshot,
  type BillingAdminPlanUpdateResult,
} from '@quizmind/contracts';
import { useDeferredValue, useState } from 'react';

import { formatUtcDateTime } from '../../../lib/datetime';

interface PlansClientProps {
  plans: BillingAdminPlanSnapshot[];
  canManagePlans?: boolean;
  currentPlanCode?: string;
}

interface PlanDraft {
  name: string;
  description: string;
  isActive: boolean;
  pricesText: string;
  entitlementsText: string;
}

interface MutationFeedback {
  tone: 'success' | 'error';
  message: string;
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function stringifyPlanPrices(prices: BillingAdminPlanSnapshot['prices']) {
  return stringifyJson(
    prices.map((price) => ({
      interval: price.interval,
      currency: price.currency,
      amount: price.amount,
      isDefault: price.isDefault,
      stripePriceId: price.stripePriceId ?? null,
    })),
  );
}

function stringifyEntitlements(entitlements: BillingAdminPlanSnapshot['plan']['entitlements']) {
  return stringifyJson(
    entitlements.map((entitlement) => ({
      key: entitlement.key,
      enabled: entitlement.enabled,
      limit: entitlement.limit ?? null,
    })),
  );
}

function createDraft(plan: BillingAdminPlanSnapshot): PlanDraft {
  return {
    name: plan.plan.name,
    description: plan.plan.description,
    isActive: plan.isActive,
    pricesText: stringifyPlanPrices(plan.prices),
    entitlementsText: stringifyEntitlements(plan.plan.entitlements),
  };
}

function createDraftMap(plans: BillingAdminPlanSnapshot[]) {
  return Object.fromEntries(plans.map((plan) => [plan.plan.code, createDraft(plan)])) as Record<string, PlanDraft>;
}

function areDraftsEqual(left: PlanDraft, right: PlanDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatPrice(price: BillingAdminPlanSnapshot['prices'][number]) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
  }).format(price.amount / 100);
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error;

    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }

  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = payload.message;

    if (Array.isArray(message)) {
      return typeof message[0] === 'string' ? message[0] : fallback;
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return fallback;
}

function parsePrices(value: string): BillingAdminPlanPriceInput[] {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Prices JSON must be an array.');
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Price row ${index + 1} must be an object.`);
    }

    const candidate = entry as Partial<BillingAdminPlanPriceInput>;

    if (candidate.interval !== 'monthly' && candidate.interval !== 'yearly') {
      throw new Error(`Price row ${index + 1} interval must be "monthly" or "yearly".`);
    }

    if (typeof candidate.currency !== 'string' || !candidate.currency.trim()) {
      throw new Error(`Price row ${index + 1} currency is required.`);
    }

    const amount = candidate.amount;

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
      throw new Error(`Price row ${index + 1} amount must be a non-negative integer.`);
    }

    if (typeof candidate.isDefault !== 'boolean') {
      throw new Error(`Price row ${index + 1} must declare isDefault as true or false.`);
    }

    return {
      interval: candidate.interval,
      currency: candidate.currency.trim().toLowerCase(),
      amount,
      isDefault: candidate.isDefault,
      ...(candidate.stripePriceId === null
        ? { stripePriceId: null }
        : typeof candidate.stripePriceId === 'string'
          ? { stripePriceId: candidate.stripePriceId.trim() || null }
          : {}),
    };
  });
}

function parseEntitlements(value: string): BillingAdminPlanEntitlementInput[] {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Entitlements JSON must be an array.');
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Entitlement row ${index + 1} must be an object.`);
    }

    const candidate = entry as Partial<BillingAdminPlanEntitlementInput>;

    if (typeof candidate.key !== 'string' || !candidate.key.trim()) {
      throw new Error(`Entitlement row ${index + 1} key is required.`);
    }

    if (typeof candidate.enabled !== 'boolean') {
      throw new Error(`Entitlement row ${index + 1} must declare enabled as true or false.`);
    }

    if (
      candidate.limit !== undefined &&
      candidate.limit !== null &&
      (!Number.isInteger(candidate.limit) || candidate.limit < 0)
    ) {
      throw new Error(`Entitlement row ${index + 1} limit must be a non-negative integer or null.`);
    }

    return {
      key: candidate.key.trim(),
      enabled: candidate.enabled,
      ...(candidate.limit === undefined ? {} : { limit: candidate.limit }),
    };
  });
}

export function PlansClient({ plans, canManagePlans = false, currentPlanCode }: PlansClientProps) {
  const [planItems, setPlanItems] = useState(plans);
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>(() => createDraftMap(plans));
  const [feedbackByCode, setFeedbackByCode] = useState<Record<string, MutationFeedback | undefined>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredPlans = planItems.filter((plan) =>
    [plan.plan.code, plan.plan.name, plan.plan.description]
      .join(' ')
      .toLowerCase()
      .includes(deferredSearchTerm.trim().toLowerCase()),
  );

  function setDraftValue(planCode: string, patch: Partial<PlanDraft>) {
    setDrafts((current) => ({
      ...current,
      [planCode]: {
        ...(current[planCode] ?? createDraft(planItems.find((item) => item.plan.code === planCode) ?? plans[0]!)),
        ...patch,
      },
    }));
    setFeedbackByCode((current) => {
      if (!current[planCode]) {
        return current;
      }

      const next = { ...current };
      delete next[planCode];
      return next;
    });
  }

  function resetDraft(planCode: string) {
    const plan = planItems.find((item) => item.plan.code === planCode);

    if (!plan) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [planCode]: createDraft(plan),
    }));
    setFeedbackByCode((current) => {
      if (!current[planCode]) {
        return current;
      }

      const next = { ...current };
      delete next[planCode];
      return next;
    });
  }

  async function savePlan(planCode: string) {
    const draft = drafts[planCode];

    if (!draft) {
      return;
    }

    let prices: BillingAdminPlanPriceInput[];
    let entitlements: BillingAdminPlanEntitlementInput[];

    try {
      prices = parsePrices(draft.pricesText);
      entitlements = parseEntitlements(draft.entitlementsText);
    } catch (error) {
      setFeedbackByCode((current) => ({
        ...current,
        [planCode]: {
          tone: 'error',
          message: error instanceof Error ? error.message : 'Invalid plan editor JSON.',
        },
      }));
      return;
    }

    setSavingCode(planCode);

    try {
      const response = await fetch('/api/admin/plans/update', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          planCode,
          name: draft.name,
          description: draft.description,
          isActive: draft.isActive,
          prices,
          entitlements,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            data?: BillingAdminPlanUpdateResult;
            error?: {
              message?: string;
            };
            message?: string | string[];
          }
        | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(getErrorMessage(payload, 'Unable to update the billing plan right now.'));
      }

      setPlanItems((current) =>
        current.map((item) => (item.plan.code === planCode ? payload.data!.plan : item)),
      );
      setDrafts((current) => ({
        ...current,
        [planCode]: createDraft(payload.data!.plan),
      }));
      setFeedbackByCode((current) => ({
        ...current,
        [planCode]: {
          tone: 'success',
          message: `Saved ${formatUtcDateTime(payload.data!.updatedAt)}.`,
        },
      }));
    } catch (error) {
      setFeedbackByCode((current) => ({
        ...current,
        [planCode]: {
          tone: 'error',
          message: error instanceof Error ? error.message : 'Unable to update the billing plan right now.',
        },
      }));
    } finally {
      setSavingCode((current) => (current === planCode ? null : current));
    }
  }

  return (
    <div className="admin-feature-flags-shell">
      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Catalog search</span>
          <h2>Find plan rows quickly</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Search plans</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="pro or business"
                value={searchTerm}
              />
            </label>
          </div>
          <p className="admin-ticket-note">
            Edit the active state, price rows, and entitlement rows directly. Prices and entitlements use JSON arrays
            so we can preserve full catalog fidelity without hiding fields behind shortcuts.
          </p>
        </article>

        <article className="panel">
          <span className="micro-label">Summary</span>
          <h2>Catalog health</h2>
          <div className="list-stack">
            <div className="list-item">
              <strong>Visible plans</strong>
              <p>
                {filteredPlans.length} visible of {planItems.length} total.
              </p>
            </div>
            <div className="list-item">
              <strong>Active plans</strong>
              <p>{planItems.filter((plan) => plan.isActive).length} active in the current catalog.</p>
            </div>
            <div className="list-item">
              <strong>Current preview anchor</strong>
              <p>{currentPlanCode ?? 'No preview plan resolved for this session.'}</p>
            </div>
            <div className="list-item">
              <strong>Write mode</strong>
              <p>
                {canManagePlans
                  ? 'This session can save plan changes into the connected billing catalog.'
                  : 'This session can inspect plans but does not have plans:manage.'}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Catalog</span>
        <h2>Plan editor</h2>
        <div className="admin-plan-grid">
          {filteredPlans.map((plan) => {
            const draft = drafts[plan.plan.code] ?? createDraft(plan);
            const isDirty = !areDraftsEqual(draft, createDraft(plan));
            const feedback = feedbackByCode[plan.plan.code];

            return (
              <article className="admin-plan-card" key={plan.plan.code}>
                <div className="billing-section-header">
                  <div>
                    <span className="micro-label">Plan</span>
                    <h3>{plan.plan.name}</h3>
                  </div>
                  <div className="tag-row">
                    <span className={plan.isActive ? 'tag' : 'tag warn'}>
                      {plan.isActive ? 'active' : 'inactive'}
                    </span>
                    <span className={plan.plan.code === currentPlanCode ? 'tag' : 'tag warn'}>
                      {plan.plan.code === currentPlanCode ? 'current preview' : plan.plan.code}
                    </span>
                    {isDirty ? <span className="tag warn">unsaved draft</span> : null}
                  </div>
                </div>

                <div className="list-stack">
                  <div className="list-item">
                    <strong>Prices</strong>
                    <p>
                      {plan.prices.length > 0
                        ? plan.prices
                            .map((price) => `${formatPrice(price)} ${price.interval}${price.isDefault ? ' default' : ''}`)
                            .join(' | ')
                        : 'No prices configured for this plan.'}
                    </p>
                  </div>
                  <div className="list-item">
                    <strong>Entitlements</strong>
                    <p>
                      {plan.plan.entitlements.length > 0
                        ? plan.plan.entitlements
                            .map((entitlement) =>
                              entitlement.limit !== undefined
                                ? `${entitlement.key} (${entitlement.enabled ? 'on' : 'off'}, limit ${entitlement.limit})`
                                : `${entitlement.key} (${entitlement.enabled ? 'on' : 'off'})`,
                            )
                            .join(' | ')
                        : 'No entitlements configured for this plan.'}
                    </p>
                  </div>
                  <div className="list-item">
                    <strong>Last updated</strong>
                    <p>{formatUtcDateTime(plan.updatedAt)}</p>
                  </div>
                </div>

                {canManagePlans ? (
                  <div className="admin-ticket-editor">
                    <label className="admin-ticket-field">
                      <span className="micro-label">Name</span>
                      <input
                        onChange={(event) => setDraftValue(plan.plan.code, { name: event.target.value })}
                        value={draft.name}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Description</span>
                      <textarea
                        onChange={(event) => setDraftValue(plan.plan.code, { description: event.target.value })}
                        rows={4}
                        value={draft.description}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Active state</span>
                      <select
                        onChange={(event) =>
                          setDraftValue(plan.plan.code, { isActive: event.target.value === 'active' })
                        }
                        value={draft.isActive ? 'active' : 'inactive'}
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Prices JSON</span>
                      <textarea
                        onChange={(event) => setDraftValue(plan.plan.code, { pricesText: event.target.value })}
                        rows={10}
                        value={draft.pricesText}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Entitlements JSON</span>
                      <textarea
                        onChange={(event) => setDraftValue(plan.plan.code, { entitlementsText: event.target.value })}
                        rows={10}
                        value={draft.entitlementsText}
                      />
                    </label>
                    <div className="admin-feature-flag-actions">
                      <button
                        className="btn-primary"
                        disabled={savingCode === plan.plan.code || !isDirty}
                        onClick={() => void savePlan(plan.plan.code)}
                        type="button"
                      >
                        {savingCode === plan.plan.code ? 'Saving...' : 'Save plan'}
                      </button>
                      <button
                        className="btn-ghost"
                        disabled={savingCode === plan.plan.code || !isDirty}
                        onClick={() => resetDraft(plan.plan.code)}
                        type="button"
                      >
                        Reset
                      </button>
                    </div>
                    {feedback ? (
                      <p
                        className={
                          feedback.tone === 'error'
                            ? 'admin-inline-feedback admin-inline-feedback--error'
                            : 'admin-inline-feedback'
                        }
                      >
                        {feedback.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
