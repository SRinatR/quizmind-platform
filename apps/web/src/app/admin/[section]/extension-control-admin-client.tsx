'use client';

import { resolveRemoteConfig } from '@quizmind/extension';
import {
  compatibilityStatuses,
  type CompatibilityRulePublishRequest,
  type CompatibilityRulePublishResult,
  type FeatureFlagDefinition,
  type FeatureFlagUpdateResult,
  remoteConfigScopes,
  type RemoteConfigLayer,
  type RemoteConfigPublishResponse,
} from '@quizmind/contracts';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  type CompatibilityRulesStateSnapshot,
  type FeatureFlagsSnapshot,
  type RemoteConfigStateSnapshot,
} from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtensionControlAdminClientProps {
  compatibilityRules: CompatibilityRulesStateSnapshot;
  featureFlags: FeatureFlagsSnapshot | null;
  remoteConfig: RemoteConfigStateSnapshot | null;
  isConnectedSession: boolean;
  canEditFlags: boolean;
}

interface FlagDraft {
  description: string;
  status: FeatureFlagDefinition['status'];
  enabled: boolean;
  rolloutPercentage: string;
  minimumExtensionVersion: string;
  allowRoles: string;
  allowUsers: string;
}

interface EditableLayer {
  id: string;
  scope: (typeof remoteConfigScopes)[number];
  priority: string;
  conditionsText: string;
  valuesText: string;
}

interface ActionFeedback {
  tone: 'ok' | 'err';
  message: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COMPAT_ACTION_LABELS: Record<string, string> = {
  supported: 'Allow',
  warn: 'Warn',
  degraded: 'Warn',
  blocked: 'Block',
  unsupported: 'Block',
};

function compatLabel(status: string): string {
  return COMPAT_ACTION_LABELS[status] ?? status;
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function csvOf(values: string[] | undefined): string {
  return values?.join(', ') ?? '';
}

function jsonOf(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObj(text: string): Record<string, unknown> {
  const s = text.trim();
  if (!s) return {};
  const v = JSON.parse(s) as unknown;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Expected a JSON object.');
  return v as Record<string, unknown>;
}

function initFlagDraft(flag: FeatureFlagDefinition): FlagDraft {
  return {
    description: flag.description,
    status: flag.status,
    enabled: flag.enabled,
    rolloutPercentage: flag.rolloutPercentage === undefined ? '' : String(flag.rolloutPercentage),
    minimumExtensionVersion: flag.minimumExtensionVersion ?? '',
    allowRoles: csvOf(flag.allowRoles),
    allowUsers: csvOf(flag.allowUsers),
  };
}

function initEditableLayer(layer: RemoteConfigLayer): EditableLayer {
  return {
    id: layer.id,
    scope: layer.scope,
    priority: String(layer.priority),
    conditionsText: jsonOf(layer.conditions ?? {}),
    valuesText: jsonOf(layer.values),
  };
}

function isDraftDirty(draft: FlagDraft, flag: FeatureFlagDefinition): boolean {
  return JSON.stringify(draft) !== JSON.stringify(initFlagDraft(flag));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ExtensionControlAdminClient({
  compatibilityRules,
  featureFlags,
  remoteConfig,
  isConnectedSession,
  canEditFlags,
}: ExtensionControlAdminClientProps) {
  const router = useRouter();
  const [, startRefresh] = useTransition();

  // Shared feedback
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  // ── Section A: Client Version Policy ─────────────────────────────────────
  const latestCompat = compatibilityRules.items[0];
  const [minVer, setMinVer] = useState(latestCompat?.minimumVersion ?? '1.4.0');
  const [recVer, setRecVer] = useState(latestCompat?.recommendedVersion ?? '1.6.0');
  const [resultStatus, setResultStatus] = useState<string>(
    latestCompat?.resultStatus ?? (compatibilityStatuses[0] ?? 'supported'),
  );
  const [schemas, setSchemas] = useState(csvOf(latestCompat?.supportedSchemaVersions ?? ['2']));
  const [caps, setCaps] = useState(csvOf(latestCompat?.requiredCapabilities ?? []));
  const [reason, setReason] = useState(latestCompat?.reason ?? '');
  const [isPublishingCompat, setIsPublishingCompat] = useState(false);

  // ── Section B: Feature Flags ──────────────────────────────────────────────
  const [flagItems, setFlagItems] = useState<FeatureFlagDefinition[]>(featureFlags?.flags ?? []);
  const [flagDrafts, setFlagDrafts] = useState<Record<string, FlagDraft>>(() =>
    Object.fromEntries((featureFlags?.flags ?? []).map((f) => [f.key, initFlagDraft(f)])),
  );
  const [flagSavingKey, setFlagSavingKey] = useState<string | null>(null);
  const [flagFeedbackMap, setFlagFeedbackMap] = useState<Record<string, ActionFeedback>>({});

  // ── Section B: Effective Config ───────────────────────────────────────────
  const [configVersionLabel, setConfigVersionLabel] = useState('draft-global');
  const [configLayers, setConfigLayers] = useState<EditableLayer[]>(() =>
    (remoteConfig?.activeLayers ?? []).map(initEditableLayer),
  );
  const [isPublishingConfig, setIsPublishingConfig] = useState(false);

  // Resolved preview from active layers (global context — no targeting applied)
  const previewValues: Record<string, unknown> = (() => {
    try {
      if (!remoteConfig?.activeLayers?.length) return {};
      const result = resolveRemoteConfig(remoteConfig.activeLayers, {});
      return (result?.values ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function publishCompatRule() {
    if (!isConnectedSession) {
      setFeedback({ tone: 'err', message: 'Connected admin session required to publish.' });
      return;
    }
    setIsPublishingCompat(true);
    setFeedback(null);
    try {
      const body: CompatibilityRulePublishRequest = {
        minimumVersion: minVer.trim(),
        recommendedVersion: recVer.trim(),
        supportedSchemaVersions: parseCsv(schemas),
        requiredCapabilities: parseCsv(caps),
        resultStatus: resultStatus as CompatibilityRulePublishRequest['resultStatus'],
        reason: reason.trim() || null,
      };
      const res = await fetch('/bff/admin/compatibility/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: CompatibilityRulePublishResult;
        error?: { message?: string };
      } | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        setFeedback({ tone: 'err', message: payload?.error?.message ?? 'Unable to publish version policy.' });
      } else {
        setFeedback({ tone: 'ok', message: `Version policy published at ${formatUtcDateTime(payload.data.publishedAt)}.` });
        startRefresh(() => router.refresh());
      }
    } catch {
      setFeedback({ tone: 'err', message: 'Unable to reach the compatibility publish route.' });
    } finally {
      setIsPublishingCompat(false);
    }
  }

  function patchFlagDraft(key: string, patch: Partial<FlagDraft>) {
    setFlagDrafts((c) => ({
      ...c,
      [key]: { ...(c[key] ?? initFlagDraft(flagItems.find((f) => f.key === key)!)), ...patch },
    }));
    setFlagFeedbackMap((c) => {
      if (!c[key]) return c;
      const next = { ...c };
      delete next[key];
      return next;
    });
  }

  async function saveFlag(key: string) {
    const flag = flagItems.find((f) => f.key === key);
    const draft = flagDrafts[key];
    if (!flag || !draft) return;
    const rolloutPct = draft.rolloutPercentage.trim() ? Number(draft.rolloutPercentage) : null;
    setFlagSavingKey(key);
    try {
      const res = await fetch('/bff/admin/feature-flags/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key,
          description: draft.description,
          status: draft.status,
          enabled: draft.enabled,
          rolloutPercentage: rolloutPct,
          minimumExtensionVersion: draft.minimumExtensionVersion.trim() || null,
          allowRoles: parseCsv(draft.allowRoles),
          allowUsers: parseCsv(draft.allowUsers),
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: FeatureFlagUpdateResult;
        error?: { message?: string };
      } | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        setFlagFeedbackMap((c) => ({
          ...c,
          [key]: { tone: 'err', message: payload?.error?.message ?? 'Save failed.' },
        }));
      } else {
        setFlagItems((c) => c.map((f) => (f.key === key ? payload.data!.flag : f)));
        setFlagDrafts((c) => ({ ...c, [key]: initFlagDraft(payload.data!.flag) }));
        setFlagFeedbackMap((c) => ({
          ...c,
          [key]: { tone: 'ok', message: `Saved ${formatUtcDateTime(payload.data!.updatedAt)}.` },
        }));
      }
    } catch {
      setFlagFeedbackMap((c) => ({ ...c, [key]: { tone: 'err', message: 'Unable to save flag.' } }));
    } finally {
      setFlagSavingKey((c) => (c === key ? null : c));
    }
  }

  async function publishConfig() {
    if (!isConnectedSession) {
      setFeedback({ tone: 'err', message: 'Connected admin session required to publish.' });
      return;
    }
    if (!configVersionLabel.trim()) {
      setFeedback({ tone: 'err', message: 'Version label is required.' });
      return;
    }
    setIsPublishingConfig(true);
    setFeedback(null);
    let parsedLayers: RemoteConfigLayer[];
    try {
      parsedLayers = configLayers.map((l, i) => {
        const conditions = parseJsonObj(l.conditionsText);
        return {
          id: l.id.trim() || `layer-${i + 1}`,
          scope: l.scope,
          priority: Number(l.priority),
          ...(Object.keys(conditions).length > 0
            ? { conditions: conditions as RemoteConfigLayer['conditions'] }
            : {}),
          values: parseJsonObj(l.valuesText) as RemoteConfigLayer['values'],
        };
      });
    } catch (e) {
      setFeedback({ tone: 'err', message: e instanceof Error ? e.message : 'Invalid layer JSON.' });
      setIsPublishingConfig(false);
      return;
    }
    try {
      const res = await fetch('/bff/admin/remote-config/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionLabel: configVersionLabel.trim(), layers: parsedLayers }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: RemoteConfigPublishResponse;
        error?: { message?: string };
      } | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        setFeedback({ tone: 'err', message: payload?.error?.message ?? 'Unable to publish config.' });
      } else {
        setFeedback({
          tone: 'ok',
          message: `Config published: ${payload.data.publishResult.versionLabel} at ${formatUtcDateTime(payload.data.publishResult.publishedAt)}.`,
        });
        startRefresh(() => router.refresh());
      }
    } catch {
      setFeedback({ tone: 'err', message: 'Unable to reach the config publish route.' });
    } finally {
      setIsPublishingConfig(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const activeConfigVersion = remoteConfig?.versions.find((v) => v.isActive);

  return (
    <div className="admin-feature-flags-shell">
      {feedback ? (
        <p className={feedback.tone === 'err' ? 'admin-inline-error' : 'admin-inline-status'}>
          {feedback.message}
        </p>
      ) : null}

      {/* ── A: Client Version Policy ─────────────────────────────────────── */}
      <section className="panel">
        <span className="micro-label">Client Version Policy</span>
        <h2>Version gates</h2>
        <div className="split-grid">
          <article>
            <div className="admin-ticket-editor">
              <label className="admin-ticket-field">
                <span className="micro-label">Minimum version</span>
                <input value={minVer} onChange={(e) => setMinVer(e.target.value)} />
              </label>
              <label className="admin-ticket-field">
                <span className="micro-label">Recommended version</span>
                <input value={recVer} onChange={(e) => setRecVer(e.target.value)} />
              </label>
              <label className="admin-ticket-field">
                <span className="micro-label">Client action</span>
                <select value={resultStatus} onChange={(e) => setResultStatus(e.target.value)}>
                  {compatibilityStatuses.map((s) => (
                    <option key={s} value={s}>
                      {compatLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-user-actions">
              <button
                className="btn-primary"
                disabled={isPublishingCompat || !isConnectedSession}
                onClick={() => void publishCompatRule()}
                type="button"
              >
                {isPublishingCompat ? 'Publishing...' : 'Publish version policy'}
              </button>
            </div>
            <details style={{ marginTop: '12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--muted)' }}>
                Advanced
              </summary>
              <div className="admin-ticket-editor" style={{ marginTop: '8px' }}>
                <label className="admin-ticket-field">
                  <span className="micro-label">Supported schema versions</span>
                  <input value={schemas} onChange={(e) => setSchemas(e.target.value)} placeholder="2, 3" />
                </label>
                <label className="admin-ticket-field">
                  <span className="micro-label">Required capabilities</span>
                  <input value={caps} onChange={(e) => setCaps(e.target.value)} placeholder="quiz-capture, history-sync" />
                </label>
                <label className="admin-ticket-field">
                  <span className="micro-label">Reason</span>
                  <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              </div>
            </details>
          </article>

          <article>
            <span className="micro-label">Active policy</span>
            {latestCompat ? (
              <div className="list-stack" style={{ marginTop: '8px' }}>
                <div className="list-item">
                  <strong>Minimum version</strong>
                  <p>{latestCompat.minimumVersion}</p>
                </div>
                <div className="list-item">
                  <strong>Recommended version</strong>
                  <p>{latestCompat.recommendedVersion}</p>
                </div>
                <div className="list-item">
                  <strong>Client action</strong>
                  <p>{compatLabel(latestCompat.resultStatus)}</p>
                </div>
                {latestCompat.reason ? (
                  <div className="list-item">
                    <strong>Reason</strong>
                    <p>{latestCompat.reason}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p style={{ marginTop: '8px' }}>No version policy published yet.</p>
            )}
          </article>
        </div>
      </section>

      {/* ── B: Runtime Settings ──────────────────────────────────────────── */}
      <section className="panel">
        <span className="micro-label">Runtime Settings</span>
        <h2>Feature flags &amp; config</h2>

        {/* B1: Feature Flags */}
        <h3 style={{ fontSize: '0.9rem', margin: '16px 0 10px' }}>Feature Flags</h3>
        {flagItems.length > 0 ? (
          <div className="admin-feature-flag-grid">
            {flagItems.map((flag) => {
              const draft = flagDrafts[flag.key] ?? initFlagDraft(flag);
              const dirty = isDraftDirty(draft, flag);
              const fb = flagFeedbackMap[flag.key];
              return (
                <article className="admin-feature-flag-card" key={flag.key}>
                  <div className="billing-section-header">
                    <div>
                      <span className="micro-label">Feature flag</span>
                      <h3>{flag.key}</h3>
                    </div>
                    <div className="tag-row">
                      <span className={draft.enabled ? 'tag' : 'tag warn'}>
                        {draft.enabled ? 'enabled' : 'disabled'}
                      </span>
                      {dirty ? <span className="tag warn">unsaved</span> : null}
                    </div>
                  </div>
                  <p style={{ fontSize: '0.82rem', margin: '4px 0 8px', color: 'var(--muted)' }}>
                    {flag.description}
                  </p>
                  {canEditFlags ? (
                    <>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          value={draft.enabled ? 'enabled' : 'disabled'}
                          onChange={(e) => patchFlagDraft(flag.key, { enabled: e.target.value === 'enabled' })}
                        >
                          <option value="enabled">Enabled</option>
                          <option value="disabled">Disabled</option>
                        </select>
                        {dirty ? (
                          <button
                            className="btn-primary"
                            disabled={flagSavingKey === flag.key}
                            onClick={() => void saveFlag(flag.key)}
                            type="button"
                          >
                            {flagSavingKey === flag.key ? 'Saving...' : 'Save'}
                          </button>
                        ) : null}
                      </div>
                      {fb ? (
                        <p
                          className={
                            fb.tone === 'err'
                              ? 'admin-inline-feedback admin-inline-feedback--error'
                              : 'admin-inline-feedback'
                          }
                        >
                          {fb.message}
                        </p>
                      ) : null}
                      <details style={{ marginTop: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--muted)' }}>
                          Advanced
                        </summary>
                        <div className="admin-ticket-editor" style={{ marginTop: '8px' }}>
                          <label className="admin-ticket-field">
                            <span className="micro-label">Description</span>
                            <textarea
                              rows={2}
                              value={draft.description}
                              onChange={(e) => patchFlagDraft(flag.key, { description: e.target.value })}
                            />
                          </label>
                          <label className="admin-ticket-field">
                            <span className="micro-label">Rollout %</span>
                            <input
                              max={100}
                              min={0}
                              placeholder="leave blank for no gate"
                              type="number"
                              value={draft.rolloutPercentage}
                              onChange={(e) => patchFlagDraft(flag.key, { rolloutPercentage: e.target.value })}
                            />
                          </label>
                          <label className="admin-ticket-field">
                            <span className="micro-label">Min extension version</span>
                            <input
                              placeholder="1.7.0"
                              value={draft.minimumExtensionVersion}
                              onChange={(e) =>
                                patchFlagDraft(flag.key, { minimumExtensionVersion: e.target.value })
                              }
                            />
                          </label>
                          <label className="admin-ticket-field">
                            <span className="micro-label">Allowed roles</span>
                            <input
                              placeholder="admin"
                              value={draft.allowRoles}
                              onChange={(e) => patchFlagDraft(flag.key, { allowRoles: e.target.value })}
                            />
                          </label>
                          <label className="admin-ticket-field">
                            <span className="micro-label">Allowed users</span>
                            <input
                              placeholder="user_1, user_2"
                              value={draft.allowUsers}
                              onChange={(e) => patchFlagDraft(flag.key, { allowUsers: e.target.value })}
                            />
                          </label>
                        </div>
                      </details>
                    </>
                  ) : (
                    <p className="admin-ticket-note">
                      Read-only. Connected admin auth required to edit flags.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)' }}>No feature flags defined.</p>
        )}

        {/* B2: Effective Config */}
        <h3 style={{ fontSize: '0.9rem', margin: '24px 0 10px' }}>Effective Config</h3>
        {remoteConfig ? (
          <>
            <div className="split-grid">
              <article className="panel" style={{ padding: '12px' }}>
                <span className="micro-label">Resolved values</span>
                {Object.keys(previewValues).length > 0 ? (
                  <div className="list-stack" style={{ marginTop: '8px' }}>
                    {Object.entries(previewValues).map(([k, v]) => (
                      <div className="list-item" key={k}>
                        <strong>{k}</strong>
                        <p>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ marginTop: '8px', color: 'var(--muted)' }}>
                    No config values in active layers.
                  </p>
                )}
                {activeConfigVersion ? (
                  <p style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    Active: {activeConfigVersion.versionLabel} (
                    {activeConfigVersion.layers.length} layer
                    {activeConfigVersion.layers.length === 1 ? '' : 's'})
                  </p>
                ) : null}
              </article>

              <article className="panel" style={{ padding: '12px' }}>
                <span className="micro-label">Publish</span>
                <div className="admin-ticket-editor" style={{ marginTop: '8px' }}>
                  <label className="admin-ticket-field">
                    <span className="micro-label">Version label</span>
                    <input
                      placeholder="spring-rollout-v3"
                      value={configVersionLabel}
                      onChange={(e) => setConfigVersionLabel(e.target.value)}
                    />
                  </label>
                </div>
                <div className="admin-user-actions">
                  <button
                    className="btn-primary"
                    disabled={isPublishingConfig || !isConnectedSession}
                    onClick={() => void publishConfig()}
                    type="button"
                  >
                    {isPublishingConfig ? 'Publishing...' : 'Publish config'}
                  </button>
                </div>
              </article>
            </div>

            <details style={{ marginTop: '12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--muted)' }}>
                Advanced: Layer editor
              </summary>
              <div style={{ marginTop: '10px' }}>
                <div className="admin-remote-config-layers">
                  {configLayers.map((layer, i) => (
                    <article className="admin-remote-config-layer" key={layer.id}>
                      <div className="billing-section-header">
                        <div>
                          <span className="micro-label">Layer {i + 1}</span>
                          <h3>{layer.id}</h3>
                        </div>
                        <button
                          className="btn-ghost"
                          type="button"
                          onClick={() =>
                            setConfigLayers((c) => c.filter((l) => l.id !== layer.id))
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="admin-ticket-editor">
                        <label className="admin-ticket-field">
                          <span className="micro-label">Layer ID</span>
                          <input
                            value={layer.id}
                            onChange={(e) =>
                              setConfigLayers((c) =>
                                c.map((l) => (l.id === layer.id ? { ...l, id: e.target.value } : l)),
                              )
                            }
                          />
                        </label>
                        <label className="admin-ticket-field">
                          <span className="micro-label">Scope</span>
                          <select
                            value={layer.scope}
                            onChange={(e) =>
                              setConfigLayers((c) =>
                                c.map((l) =>
                                  l.id === layer.id
                                    ? { ...l, scope: e.target.value as EditableLayer['scope'] }
                                    : l,
                                ),
                              )
                            }
                          >
                            {remoteConfigScopes.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-ticket-field">
                          <span className="micro-label">Priority</span>
                          <input
                            value={layer.priority}
                            onChange={(e) =>
                              setConfigLayers((c) =>
                                c.map((l) => (l.id === layer.id ? { ...l, priority: e.target.value } : l)),
                              )
                            }
                          />
                        </label>
                        <label className="admin-ticket-field">
                          <span className="micro-label">Conditions JSON</span>
                          <textarea
                            rows={4}
                            value={layer.conditionsText}
                            onChange={(e) =>
                              setConfigLayers((c) =>
                                c.map((l) =>
                                  l.id === layer.id ? { ...l, conditionsText: e.target.value } : l,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="admin-ticket-field">
                          <span className="micro-label">Values JSON</span>
                          <textarea
                            rows={6}
                            value={layer.valuesText}
                            onChange={(e) =>
                              setConfigLayers((c) =>
                                c.map((l) =>
                                  l.id === layer.id ? { ...l, valuesText: e.target.value } : l,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() =>
                    setConfigLayers((c) => [
                      ...c,
                      {
                        id: `draft-layer-${c.length + 1}`,
                        scope: 'global',
                        priority: String((c.length + 1) * 10),
                        conditionsText: '{}',
                        valuesText: '{}',
                      },
                    ])
                  }
                >
                  Add layer
                </button>
              </div>
            </details>
          </>
        ) : (
          <p style={{ color: 'var(--muted)' }}>Remote config data unavailable for this session.</p>
        )}
      </section>

      {/* ── C: Recent Changes ────────────────────────────────────────────── */}
      <section className="panel">
        <span className="micro-label">Recent Changes</span>
        <h2>Recent activity</h2>
        <div className="list-stack">
          {latestCompat ? (
            <div className="list-item">
              <strong>Version policy</strong>
              <p>
                {latestCompat.minimumVersion} &rarr; {latestCompat.recommendedVersion} &mdash;{' '}
                {compatLabel(latestCompat.resultStatus)}
              </p>
              <span className="list-muted">Published {formatUtcDateTime(latestCompat.createdAt)}</span>
            </div>
          ) : (
            <div className="list-item">
              <strong>Version policy</strong>
              <p>No version policy published yet.</p>
            </div>
          )}

          {remoteConfig?.versions[0] ? (
            <div className="list-item">
              <strong>Config: {remoteConfig.versions[0].versionLabel}</strong>
              <p>
                {remoteConfig.versions[0].layers.length} layer
                {remoteConfig.versions[0].layers.length === 1 ? '' : 's'}
              </p>
              <span className="list-muted">
                {formatUtcDateTime(remoteConfig.versions[0].publishedAt)} by{' '}
                {remoteConfig.versions[0].publishedBy?.displayName ??
                  remoteConfig.versions[0].publishedBy?.email ??
                  'Unknown'}
              </span>
            </div>
          ) : (
            <div className="list-item">
              <strong>Config</strong>
              <p>No config versions published yet.</p>
            </div>
          )}

          <div className="list-item">
            <strong>Feature flags</strong>
            <p>
              {flagItems.length} flag{flagItems.length === 1 ? '' : 's'} &mdash;{' '}
              {flagItems.filter((f) => f.enabled).length} enabled
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
