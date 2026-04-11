'use client';

import { compareSemver, resolveFeatureFlags } from '@quizmind/extension';
import {
  featureFlagStatuses,
  systemRoles,
  workspaceRoles,
  type FeatureFlagDefinition,
  type FeatureFlagUpdateResult,
} from '@quizmind/contracts';
import { startTransition, useDeferredValue, useState } from 'react';

import { formatUtcDateTime } from '../../../lib/datetime';

interface FeatureFlagsClientProps {
  flags: FeatureFlagDefinition[];
  canEdit?: boolean;
  initialPreviewContext: {
    extensionVersion?: string;
    roles?: string[];
    userId?: string;
  };
}

interface FeatureFlagDraft {
  description: string;
  status: FeatureFlagDefinition['status'];
  enabled: boolean;
  rolloutPercentage: string;
  minimumExtensionVersion: string;
  allowRoles: string;
  allowUsers: string;
}

interface MutationFeedback {
  tone: 'success' | 'error';
  message: string;
}

const availableRoleOptions = [...systemRoles, ...workspaceRoles];

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyCsv(values: string[] | undefined): string {
  return values?.join(', ') ?? '';
}

function matchesSearch(flag: FeatureFlagDefinition, searchTerm: string): boolean {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [flag.key, flag.description, ...(flag.allowRoles ?? [])]
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearch);
}

function describeTargeting(flag: FeatureFlagDefinition): string {
  const parts: string[] = [];

  if (flag.allowRoles?.length) {
    parts.push(`roles: ${flag.allowRoles.join(', ')}`);
  }

  if (flag.allowUsers?.length) {
    parts.push(`users: ${flag.allowUsers.join(', ')}`);
  }

  if (parts.length === 0) {
    return 'Global rollout with no explicit targeting constraints.';
  }

  return parts.join(' | ');
}

function createDraft(flag: FeatureFlagDefinition): FeatureFlagDraft {
  return {
    description: flag.description,
    status: flag.status,
    enabled: flag.enabled,
    rolloutPercentage: flag.rolloutPercentage === undefined ? '' : String(flag.rolloutPercentage),
    minimumExtensionVersion: flag.minimumExtensionVersion ?? '',
    allowRoles: stringifyCsv(flag.allowRoles),
    allowUsers: stringifyCsv(flag.allowUsers),
  };
}

function createDraftMap(flags: FeatureFlagDefinition[]) {
  return Object.fromEntries(flags.map((flag) => [flag.key, createDraft(flag)])) as Record<string, FeatureFlagDraft>;
}

function areDraftsEqual(left: FeatureFlagDraft, right: FeatureFlagDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function parseRolloutPercentage(value: string): number | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('Rollout percentage must be an integer between 0 and 100.');
  }

  return parsed;
}

export function FeatureFlagsClient({
  flags,
  canEdit = false,
  initialPreviewContext,
}: FeatureFlagsClientProps) {
  const [flagItems, setFlagItems] = useState(flags);
  const [drafts, setDrafts] = useState<Record<string, FeatureFlagDraft>>(() => createDraftMap(flags));
  const [feedbackByKey, setFeedbackByKey] = useState<Record<string, MutationFeedback | undefined>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [previewContext, setPreviewContext] = useState({
    extensionVersion: initialPreviewContext.extensionVersion ?? '1.7.0',
    roles: stringifyCsv(initialPreviewContext.roles),
    userId: initialPreviewContext.userId ?? '',
  });

  const filteredFlags = flagItems.filter((flag) => matchesSearch(flag, deferredSearchTerm));
  const resolvedFlags = resolveFeatureFlags(flagItems, {
    extensionVersion: previewContext.extensionVersion.trim() || undefined,
    roles: parseCsv(previewContext.roles),
    userId: previewContext.userId.trim() || undefined,
  });
  const extensionVersionBlocks = filteredFlags.filter((flag) => {
    if (!flag.minimumExtensionVersion || !previewContext.extensionVersion.trim()) {
      return false;
    }

    return compareSemver(previewContext.extensionVersion.trim(), flag.minimumExtensionVersion) < 0;
  }).length;

  function setDraftValue(key: string, patch: Partial<FeatureFlagDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? createDraft(flagItems.find((flag) => flag.key === key) ?? flags[0]!)),
        ...patch,
      },
    }));
    setFeedbackByKey((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function resetDraft(key: string) {
    const flag = flagItems.find((item) => item.key === key);

    if (!flag) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [key]: createDraft(flag),
    }));
    setFeedbackByKey((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function saveFlag(key: string) {
    const flag = flagItems.find((item) => item.key === key);
    const draft = drafts[key];

    if (!flag || !draft) {
      return;
    }

    let rolloutPercentage: number | null;

    try {
      rolloutPercentage = parseRolloutPercentage(draft.rolloutPercentage);
    } catch (error) {
      setFeedbackByKey((current) => ({
        ...current,
        [key]: {
          tone: 'error',
          message: error instanceof Error ? error.message : 'Unable to parse rollout percentage.',
        },
      }));
      return;
    }

    setSavingKey(key);

    try {
      const response = await fetch('/bff/admin/feature-flags/update', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          key,
          description: draft.description,
          status: draft.status,
          enabled: draft.enabled,
          rolloutPercentage,
          minimumExtensionVersion: draft.minimumExtensionVersion.trim() || null,
          allowRoles: parseCsv(draft.allowRoles),
          allowUsers: parseCsv(draft.allowUsers),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            data?: FeatureFlagUpdateResult;
            error?: {
              message?: string;
            };
            message?: string | string[];
          }
        | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(getErrorMessage(payload, 'Unable to update feature flag right now.'));
      }

      startTransition(() => {
        setFlagItems((current) => current.map((item) => (item.key === key ? payload.data!.flag : item)));
        setDrafts((current) => ({
          ...current,
          [key]: createDraft(payload.data!.flag),
        }));
        setFeedbackByKey((current) => ({
          ...current,
          [key]: {
            tone: 'success',
            message: `Saved ${formatUtcDateTime(payload.data!.updatedAt)}.`,
          },
        }));
      });
    } catch (error) {
      setFeedbackByKey((current) => ({
        ...current,
        [key]: {
          tone: 'error',
          message: error instanceof Error ? error.message : 'Unable to update feature flag right now.',
        },
      }));
    } finally {
      setSavingKey((current) => (current === key ? null : current));
    }
  }

  return (
    <div className="admin-feature-flags-shell">
      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Preview context</span>
          <h2>Resolve rollout targeting</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Search flags</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="beta.remote-config-v2"
                value={searchTerm}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">User ID</span>
              <input
                onChange={(event) =>
                  setPreviewContext((current) => ({
                    ...current,
                    userId: event.target.value,
                  }))
                }
                placeholder="user id"
                value={previewContext.userId}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Roles</span>
              <input
                onChange={(event) =>
                  setPreviewContext((current) => ({
                    ...current,
                    roles: event.target.value,
                  }))
                }
                placeholder="admin"
                value={previewContext.roles}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Extension version</span>
              <input
                onChange={(event) =>
                  setPreviewContext((current) => ({
                    ...current,
                    extensionVersion: event.target.value,
                  }))
                }
                placeholder="1.7.0"
                value={previewContext.extensionVersion}
              />
            </label>
          </div>
          {canEdit ? (
            <p className="admin-ticket-note">
              Saving a flag updates the connected control plane and immediately affects future bootstrap resolution.
            </p>
          ) : (
            <p className="admin-ticket-note">
              This session can preview rollout targeting but does not currently have write access to feature flags.
            </p>
          )}
        </article>

        <article className="panel">
          <span className="micro-label">Resolved preview</span>
          <h2>Flags that would be active</h2>
          <div className="tag-row">
            <span className="tag">{filteredFlags.length} visible</span>
            <span className="tag">{resolvedFlags.length} active in preview</span>
            {extensionVersionBlocks > 0 ? (
              <span className="tag warn">{extensionVersionBlocks} gated by version</span>
            ) : null}
          </div>
          <div className="list-stack">
            {resolvedFlags.length > 0 ? (
              resolvedFlags.map((flagKey) => (
                <div className="list-item" key={flagKey}>
                  <strong>{flagKey}</strong>
                  <p>Matched the current rollout context.</p>
                </div>
              ))
            ) : (
              <div className="list-item">
                <strong>No flags resolved</strong>
                <p>The current targeting context does not activate any flags.</p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Catalog</span>
        <h2>Rollout definitions</h2>
        <div className="admin-feature-flag-grid">
          {filteredFlags.map((flag) => {
            const draft = drafts[flag.key] ?? createDraft(flag);
            const isActiveInPreview = resolvedFlags.includes(flag.key);
            const isVersionBlocked =
              Boolean(flag.minimumExtensionVersion) &&
              Boolean(previewContext.extensionVersion.trim()) &&
              compareSemver(previewContext.extensionVersion.trim(), flag.minimumExtensionVersion!) < 0;
            const isDirty = !areDraftsEqual(draft, createDraft(flag));
            const feedback = feedbackByKey[flag.key];

            return (
              <article className="admin-feature-flag-card" key={flag.key}>
                <div className="billing-section-header">
                  <div>
                    <span className="micro-label">Feature flag</span>
                    <h3>{flag.key}</h3>
                  </div>
                  <div className="tag-row">
                    <span className={flag.status === 'active' && flag.enabled ? 'tag' : 'tag warn'}>
                      {flag.enabled ? flag.status : 'disabled'}
                    </span>
                    <span className={isActiveInPreview ? 'tag' : 'tag warn'}>
                      {isActiveInPreview ? 'preview on' : 'preview off'}
                    </span>
                    {isDirty ? <span className="tag warn">unsaved draft</span> : null}
                  </div>
                </div>
                <p>{flag.description}</p>
                <div className="list-stack">
                  <div className="list-item">
                    <strong>Targeting</strong>
                    <p>{describeTargeting(flag)}</p>
                  </div>
                  <div className="list-item">
                    <strong>Rollout</strong>
                    <p>
                      {flag.rolloutPercentage !== undefined
                        ? `${flag.rolloutPercentage}% gradual rollout`
                        : 'No percentage gate configured.'}
                    </p>
                  </div>
                  {flag.minimumExtensionVersion ? (
                    <div className="list-item">
                      <strong>Minimum extension version</strong>
                      <p>
                        {flag.minimumExtensionVersion}
                        {isVersionBlocked ? ' | current preview is below minimum' : ' | preview satisfies minimum'}
                      </p>
                    </div>
                  ) : null}
                </div>

                {canEdit ? (
                  <div className="admin-ticket-editor">
                    <label className="admin-ticket-field">
                      <span className="micro-label">Description</span>
                      <textarea
                        onChange={(event) => setDraftValue(flag.key, { description: event.target.value })}
                        value={draft.description}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Status</span>
                      <select
                        onChange={(event) =>
                          setDraftValue(flag.key, {
                            status: event.target.value as FeatureFlagDefinition['status'],
                          })
                        }
                        value={draft.status}
                      >
                        {featureFlagStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Enabled state</span>
                      <select
                        onChange={(event) =>
                          setDraftValue(flag.key, {
                            enabled: event.target.value === 'enabled',
                          })
                        }
                        value={draft.enabled ? 'enabled' : 'disabled'}
                      >
                        <option value="enabled">enabled</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Rollout percentage</span>
                      <input
                        max={100}
                        min={0}
                        onChange={(event) => setDraftValue(flag.key, { rolloutPercentage: event.target.value })}
                        placeholder="leave blank to remove"
                        type="number"
                        value={draft.rolloutPercentage}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Minimum extension version</span>
                      <input
                        onChange={(event) =>
                          setDraftValue(flag.key, {
                            minimumExtensionVersion: event.target.value,
                          })
                        }
                        placeholder="1.7.0"
                        value={draft.minimumExtensionVersion}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Allowed roles</span>
                      <input
                        onChange={(event) => setDraftValue(flag.key, { allowRoles: event.target.value })}
                        placeholder="admin"
                        value={draft.allowRoles}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Allowed users</span>
                      <input
                        onChange={(event) => setDraftValue(flag.key, { allowUsers: event.target.value })}
                        placeholder="user_1, user_2"
                        value={draft.allowUsers}
                      />
                    </label>
                    <p className="admin-ticket-note">
                      Available roles: {availableRoleOptions.join(', ')}.
                    </p>
                    <div className="admin-feature-flag-actions">
                      <button
                        className="btn-primary"
                        disabled={savingKey === flag.key || !isDirty}
                        onClick={() => void saveFlag(flag.key)}
                        type="button"
                      >
                        {savingKey === flag.key ? 'Saving...' : 'Save changes'}
                      </button>
                      <button
                        className="btn-ghost"
                        disabled={savingKey === flag.key || !isDirty}
                        onClick={() => resetDraft(flag.key)}
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
