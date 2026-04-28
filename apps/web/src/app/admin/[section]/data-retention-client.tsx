'use client';

import { type PlatformRetentionPolicySnapshot, type PlatformRetentionPolicyUpdateRequest } from '@quizmind/contracts';
import { useEffect, useMemo, useState } from 'react';

import { usePreferences } from '../../../lib/preferences';

interface RetentionRouteResponse {
  ok: boolean;
  data?: PlatformRetentionPolicySnapshot;
  error?: { message?: string };
}

const retentionFieldConfig = {
  aiHistoryContentDays: { min: 1, max: 365, step: 1 },
  aiHistoryAttachmentDays: { min: 1, max: 365, step: 1 },
  adminLogActivityDays: { min: 1, max: 3650, step: 1 },
  adminLogDomainDays: { min: 1, max: 3650, step: 1 },
  adminLogSystemDays: { min: 1, max: 3650, step: 1 },
  adminLogAuditDays: { min: 30, max: 3650, step: 1 },
  adminLogSecurityDays: { min: 30, max: 3650, step: 1 },
  adminLogAdminDays: { min: 30, max: 3650, step: 1 },
  accessTokenLifetimeMinutes: { min: 5, max: 1440, step: 1 },
  refreshTokenLifetimeDays: { min: 1, max: 365, step: 1 },
  passwordResetLifetimeHours: { min: 1, max: 24, step: 1 },
} as const;

const RETENTION_DEFAULTS: PlatformRetentionPolicyUpdateRequest = {
  aiHistoryContentDays: 7,
  aiHistoryAttachmentDays: 7,
  adminLogRetentionEnabled: false,
  adminLogActivityDays: 30,
  adminLogDomainDays: 30,
  adminLogSystemDays: 30,
  adminLogAuditDays: 365,
  adminLogSecurityDays: 365,
  adminLogAdminDays: 365,
  adminLogSensitiveRetentionEnabled: false,
  accessTokenLifetimeMinutes: 15,
  refreshTokenLifetimeDays: 30,
  passwordResetLifetimeHours: 1,
};

type EditableRetentionDraft = PlatformRetentionPolicyUpdateRequest;

function toEditableRetentionDraft(policy: PlatformRetentionPolicySnapshot['policy']): EditableRetentionDraft {
  return {
    aiHistoryContentDays: policy.aiHistoryContentDays,
    aiHistoryAttachmentDays: policy.aiHistoryAttachmentDays,
    adminLogRetentionEnabled: policy.adminLogRetentionEnabled,
    adminLogActivityDays: policy.adminLogActivityDays,
    adminLogDomainDays: policy.adminLogDomainDays,
    adminLogSystemDays: policy.adminLogSystemDays,
    adminLogAuditDays: policy.adminLogAuditDays,
    adminLogSecurityDays: policy.adminLogSecurityDays,
    adminLogAdminDays: policy.adminLogAdminDays,
    adminLogSensitiveRetentionEnabled: policy.adminLogSensitiveRetentionEnabled,
    accessTokenLifetimeMinutes: policy.accessTokenLifetimeMinutes,
    refreshTokenLifetimeDays: policy.refreshTokenLifetimeDays,
    passwordResetLifetimeHours: policy.passwordResetLifetimeHours,
  };
}

export function DataRetentionAdminClient() {
  const { t } = usePreferences();
  const adminT = t.admin;
  const [retentionState, setRetentionState] = useState<PlatformRetentionPolicySnapshot | null>(null);
  const [retentionDraft, setRetentionDraft] = useState<EditableRetentionDraft | null>(null);
  const [retentionStatus, setRetentionStatus] = useState<string | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [isSavingRetention, setIsSavingRetention] = useState(false);

  async function loadRetentionPolicy() {
    const res = await fetch('/bff/admin/settings/retention', { cache: 'no-store' });
    const payload = (await res.json().catch(() => null)) as RetentionRouteResponse | null;
    if (!res.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error?.message ?? adminT.settings.retention.loadFailed);
    }
    setRetentionState(payload.data);
    setRetentionDraft(toEditableRetentionDraft(payload.data.policy));
  }

  useEffect(() => {
    void loadRetentionPolicy().catch(() => setRetentionError(adminT.settings.retention.loadFailed));
  }, [adminT.settings.retention.loadFailed]);

  const isDirty = useMemo(() => {
    if (!retentionState || !retentionDraft) return false;
    return JSON.stringify(toEditableRetentionDraft(retentionState.policy)) !== JSON.stringify(retentionDraft);
  }, [retentionDraft, retentionState]);

  async function handleRetentionSave() {
    if (!retentionDraft) return;
    for (const [field, config] of Object.entries(retentionFieldConfig) as Array<[keyof typeof retentionFieldConfig, { min: number; max: number; step: number }]>) {
      if (!(field in retentionDraft)) continue;
      const value = retentionDraft[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < config.min || value > config.max) {
        setRetentionError(adminT.settings.retention.validationDays);
        return;
      }
    }

    setRetentionError(null);
    setRetentionStatus(t.settings.account.saving);
    setIsSavingRetention(true);
    const res = await fetch('/bff/admin/settings/retention', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(retentionDraft),
    });
    const payload = (await res.json().catch(() => null)) as RetentionRouteResponse | null;
    if (!res.ok || !payload?.ok || !payload.data) {
      setRetentionStatus(null);
      setRetentionError(payload?.error?.message ?? adminT.settings.retention.saveFailed);
      setIsSavingRetention(false);
      return;
    }

    setRetentionState(payload.data);
    setRetentionDraft(toEditableRetentionDraft(payload.data.policy));
    setRetentionStatus(t.settings.account.savedMessage);
    setIsSavingRetention(false);
  }

  return (
    <section className="retention-page">
      <header className="retention-page__header">
        <h3 className="settings-section__title">{adminT.settings.retention.title}</h3>
        <p className="settings-section__desc">{adminT.settings.retention.desc}</p>
      </header>

      {retentionStatus ? <div className="banner banner-info">{retentionStatus}</div> : null}
      {retentionError ? <div className="banner banner-error">{retentionError}</div> : null}

      {retentionDraft ? (
        <>
          <article className="panel retention-card">
            <div className="retention-card__header">
              <h4 className="retention-card__title">{adminT.settings.retention.aiSectionTitle}</h4>
              <p className="retention-card__desc">{adminT.settings.retention.aiSectionDesc}</p>
            </div>
            <div className="retention-field-grid">
              {(['aiHistoryContentDays', 'aiHistoryAttachmentDays'] as const).map((field) => (
                <label className="retention-field" key={field}>
                  <span className="retention-field__label">{adminT.settings.retention[field]}</span>
                  <span className="retention-field__desc">{adminT.settings.retention[`${field}Desc`]}</span>
                  <input
                    type="number"
                    value={String(retentionDraft[field] ?? '')}
                    min={retentionFieldConfig[field].min}
                    max={retentionFieldConfig[field].max}
                    step={retentionFieldConfig[field].step}
                    onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), [field]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
            <div className="retention-readonly-row">
              <span className="retention-field__label">{adminT.settings.retention.legacyAiRequestDays}</span>
              <strong>{adminT.settings.retention.daysSummary.replace('{days}', String(retentionState?.policy.legacyAiRequestDays ?? 7))}</strong>
              <span className="retention-field__desc">{adminT.settings.retention.legacySummary}</span>
            </div>
          </article>

          <article className="panel retention-card">
            <div className="retention-card__header">
              <h4 className="retention-card__title">{adminT.settings.retention.adminLogsSectionTitle}</h4>
              <p className="retention-card__desc">{adminT.settings.retention.adminLogsSectionDesc}</p>
            </div>
            <label className="retention-toggle-row">
              <span className="retention-toggle-row__copy">
                <span className="retention-field__label">{adminT.settings.retention.enableCleanup}</span>
                <span className="retention-field__desc">{adminT.settings.retention.enableCleanupDesc}</span>
              </span>
              <span className="retention-toggle-row__control">
                <input
                  type="checkbox"
                  checked={Boolean(retentionDraft.adminLogRetentionEnabled)}
                  onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), adminLogRetentionEnabled: e.target.checked }))}
                />
              </span>
            </label>

            <div className="retention-field-grid">
              {(['adminLogActivityDays', 'adminLogDomainDays', 'adminLogSystemDays', 'adminLogAuditDays', 'adminLogSecurityDays', 'adminLogAdminDays'] as const).map((field) => (
                <label className="retention-field" key={field}>
                  <span className="retention-field__label">{adminT.settings.retention[field]}</span>
                  <input
                    type="number"
                    value={String(retentionDraft[field] ?? '')}
                    min={retentionFieldConfig[field].min}
                    max={retentionFieldConfig[field].max}
                    step={retentionFieldConfig[field].step}
                    onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), [field]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>

            <div className="retention-callout retention-callout--warning">
              <h5>{adminT.settings.retention.sensitiveCleanupTitle}</h5>
              <p>{adminT.settings.retention.sensitiveWarning}</p>
              <label className="retention-toggle-row">
                <span className="retention-toggle-row__copy">
                  <span className="retention-field__label">{adminT.settings.retention.enableSensitiveCleanup}</span>
                  <span className="retention-field__desc">{adminT.settings.retention.enableSensitiveCleanupDesc}</span>
                </span>
                <span className="retention-toggle-row__control">
                  <input
                    type="checkbox"
                    checked={Boolean(retentionDraft.adminLogSensitiveRetentionEnabled)}
                    onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), adminLogSensitiveRetentionEnabled: e.target.checked }))}
                  />
                </span>
              </label>
            </div>
          </article>

          <article className="panel retention-card">
            <div className="retention-card__header">
              <h4 className="retention-card__title">{adminT.settings.retention.authSectionTitle}</h4>
              <p className="retention-card__desc">{adminT.settings.retention.authSectionDesc}</p>
            </div>

            <div className="retention-callout">
              <p>{adminT.settings.retention.authIssuedOnlyNote}</p>
            </div>

            <div className="retention-field-grid retention-field-grid--auth">
              {(['accessTokenLifetimeMinutes', 'refreshTokenLifetimeDays', 'passwordResetLifetimeHours'] as const).map((field) => (
                <label className="retention-field" key={field}>
                  <span className="retention-field__label">{adminT.settings.retention[field]}</span>
                  <span className="retention-field__desc">{adminT.settings.retention[`${field}Desc`]}</span>
                  <input
                    type="number"
                    value={String(retentionDraft[field] ?? '')}
                    min={retentionFieldConfig[field].min}
                    max={retentionFieldConfig[field].max}
                    step={retentionFieldConfig[field].step}
                    onChange={(e) => setRetentionDraft((prev) => ({ ...(prev ?? {}), [field]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
          </article>

          <article className="panel retention-card">
            <div className="retention-card__header">
              <h4 className="retention-card__title">{adminT.settings.retention.readOnlySectionTitle}</h4>
              <p className="retention-card__desc">{adminT.settings.retention.readOnlySectionDesc}</p>
            </div>
            <div className="retention-readonly-row">
              <span className="retention-field__label">{adminT.settings.retention.emailVerificationLifetimeHours}</span>
              <strong>{adminT.settings.retention.hoursSummary.replace('{hours}', String(retentionState?.policy.emailVerificationLifetimeHours ?? 24))}</strong>
              <span className="retention-field__desc">{adminT.settings.retention.emailVerificationFutureNote}</span>
            </div>
          </article>
        </>
      ) : null}

      <div className="retention-actions">
        <button className="btn-primary" type="button" onClick={() => void handleRetentionSave()} disabled={isSavingRetention || !isDirty}>
          {isSavingRetention ? t.settings.account.saving : t.common.save}
        </button>
        <button className="btn-ghost" type="button" onClick={() => setRetentionDraft(retentionState ? toEditableRetentionDraft(retentionState.policy) : null)} disabled={isSavingRetention || !isDirty}>
          {t.common.cancel}
        </button>
        <button className="btn-ghost" type="button" onClick={() => setRetentionDraft(RETENTION_DEFAULTS)} disabled={isSavingRetention}>
          {adminT.settings.retention.resetDefaults}
        </button>
      </div>
    </section>
  );
}
