'use client';

import {
  type AiAccessPolicyMode,
  type AiProvider,
  type AiProviderPolicyUpdateRequest,
  type AiProviderPolicyUpdateResult,
  type AiProviderPolicyResetResult,
  type ProviderCredentialMutationResult,
  type ProviderCredentialRevokeResult,
} from '@quizmind/contracts';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { formatUtcDateTime } from '../../../lib/datetime';
import { type AdminProviderGovernanceStateSnapshot } from '../../../lib/api';
import { usePreferences } from '../../../lib/preferences';

interface Props {
  governance: AdminProviderGovernanceStateSnapshot;
  isConnectedSession: boolean;
}

interface MutationRouteResponse<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

function normalizeCsv(value: string): string[] {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean))).sort();
}

function createPolicyState(governance: AdminProviderGovernanceStateSnapshot) {
  return {
    mode: governance.policy.mode as AiAccessPolicyMode,
    allowPlatformManaged: governance.policy.allowPlatformManaged,
    allowBringYourOwnKey: governance.policy.allowBringYourOwnKey,
    allowDirectProviderMode: governance.policy.allowDirectProviderMode,
    allowWorkspaceSharedCredentials: governance.policy.allowWorkspaceSharedCredentials ?? false,
    requireAdminApproval: governance.policy.requireAdminApproval ?? false,
    allowVisionOnUserKeys: governance.policy.allowVisionOnUserKeys ?? false,
    providersText: governance.policy.providers.join(', '),
    defaultProvider: governance.policy.defaultProvider ?? '',
    defaultModel: governance.policy.defaultModel ?? '',
    allowedModelTagsText: (governance.policy.allowedModelTags ?? []).join(', '),
    reason: governance.policy.reason ?? '',
  };
}

function deriveStatus(governance: AdminProviderGovernanceStateSnapshot): { label: string; ok: boolean } {
  const { policy, items } = governance;
  const activeProvider = policy.defaultProvider === 'routerai' ? 'routerai' : 'openrouter';
  const hasKey = items.some(
    (item) => item.provider === activeProvider && item.ownerType === 'platform' && !item.revokedAt,
  );

  if (!hasKey) {
    return { label: activeProvider === 'routerai' ? 'routerAiMissing' : 'openRouterMissing', ok: false };
  }

  const policyOk =
    policy.mode === 'platform_only' &&
    policy.allowPlatformManaged === true &&
    policy.allowBringYourOwnKey === false &&
    policy.allowDirectProviderMode === false &&
    (policy.allowWorkspaceSharedCredentials ?? false) === false &&
    (policy.requireAdminApproval ?? false) === false &&
    policy.providers.length === 1 &&
    policy.providers[0] === activeProvider &&
    policy.defaultProvider === activeProvider;

  if (!policyOk) {
    return { label: 'policyNotLockedPlatformOnly', ok: false };
  }

  return { label: activeProvider === 'routerai' ? 'routerAiActive' : 'openRouterActive', ok: true };
}

export function AdminAiProvidersClient({ governance, isConnectedSession }: Props) {
  const router = useRouter();
  const { t } = usePreferences();
  const ai = t.admin.aiRouting;
  const initialPlatformProvider = governance.policy.defaultProvider === 'routerai' ? 'routerai' : 'openrouter';

  // Primary action state
  const [quickProvider, setQuickProvider] = useState<Extract<AiProvider, 'openrouter' | 'routerai'>>(initialPlatformProvider);
  const [quickSecret, setQuickSecret] = useState('');
  const [isSavingAndActivating, setIsSavingAndActivating] = useState(false);

  // Shared status
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Advanced section
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [policyState, setPolicyState] = useState(() => createPolicyState(governance));
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [isResettingPolicy, setIsResettingPolicy] = useState(false);
  const [advancedRotateSecret, setAdvancedRotateSecret] = useState('');
  const [isRotatingKey, setIsRotatingKey] = useState(false);
  const [isRevokingId, setIsRevokingId] = useState<string | null>(null);

  const canManagePlatform = governance.accessDecision.allowed;
  const canRotate = governance.rotateDecision.allowed || canManagePlatform;
  const workspaceOverrideActive = governance.policy.scopeType === 'workspace';
  const quickProviderLabel = quickProvider === 'routerai' ? 'RouterAI' : 'OpenRouter';
  const activePolicyProvider = governance.policy.defaultProvider === 'routerai' ? 'routerai' : 'openrouter';
  const platformQuickProviderCred = governance.items
    .filter((item) => item.provider === quickProvider && item.ownerType === 'platform' && !item.revokedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
  const platformActiveProviderCred = governance.items
    .filter((item) => item.provider === activePolicyProvider && item.ownerType === 'platform' && !item.revokedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
  const platformOpenRouterCred = governance.items
    .filter((item) => item.provider === 'openrouter' && item.ownerType === 'platform' && !item.revokedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
  const platformRouterAiCred = governance.items
    .filter((item) => item.provider === 'routerai' && item.ownerType === 'platform' && !item.revokedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
  const status = deriveStatus(governance);
  const statusLabel = ai[status.label as keyof typeof ai] ?? status.label;
  const lastPolicyChange = governance.policyHistory[0] ?? null;

  async function saveAndActivate() {
    if (!quickSecret.trim() && !platformQuickProviderCred) {
      setErrorMessage(`${quickProviderLabel} API key is required.`);
      setStatusMessage(null);
      return;
    }

    setIsSavingAndActivating(true);
    setErrorMessage(null);
    setStatusMessage(`Saving and activating ${quickProviderLabel} routing...`);

    try {
      const response = await fetch(`/bff/admin/ai-routing/${quickProvider}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: quickSecret.trim(), defaultModel: null }),
      });

      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<{ credentialUpdatedAt?: string; policyUpdatedAt: string }> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSavingAndActivating(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? `Unable to activate ${quickProviderLabel} routing.`);
        return;
      }

      setQuickSecret('');
      setIsSavingAndActivating(false);
      setStatusMessage(`Activated ${quickProviderLabel} at ${formatUtcDateTime(payload.data.policyUpdatedAt)}.`);
      router.refresh();
    } catch {
      setIsSavingAndActivating(false);
      setStatusMessage(null);
      setErrorMessage(ai.unableToReachServer);
    }
  }

  async function savePolicy() {
    const providers = normalizeCsv(policyState.providersText).filter((provider): provider is AiProvider =>
      governance.providers.some((entry) => entry.provider === provider),
    );

    if (providers.length === 0) {
      setStatusMessage(null);
      setErrorMessage(ai.failedToLoadProviders);
      return;
    }

    setIsSavingPolicy(true);
    setErrorMessage(null);
    setStatusMessage(ai.savingProviderPolicy);

    try {
      const requestBody: AiProviderPolicyUpdateRequest = {
        mode: policyState.mode,
        allowPlatformManaged: policyState.allowPlatformManaged,
        allowBringYourOwnKey: policyState.allowBringYourOwnKey,
        allowDirectProviderMode: policyState.allowDirectProviderMode,
        allowWorkspaceSharedCredentials: policyState.allowWorkspaceSharedCredentials,
        requireAdminApproval: policyState.requireAdminApproval,
        allowVisionOnUserKeys: policyState.allowVisionOnUserKeys,
        providers,
        allowedModelTags: normalizeCsv(policyState.allowedModelTagsText),
        defaultProvider: policyState.defaultProvider ? (policyState.defaultProvider as AiProvider) : null,
        defaultModel: policyState.defaultModel || null,
        reason: policyState.reason || null,
      };
      const response = await fetch('/bff/admin/providers/policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<AiProviderPolicyUpdateResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSavingPolicy(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? ai.policySaveFailedShort);
        return;
      }

      setIsSavingPolicy(false);
      setStatusMessage(`Saved AI provider policy at ${formatUtcDateTime(payload.data.updatedAt)}.`);
      router.refresh();
    } catch {
      setIsSavingPolicy(false);
      setStatusMessage(null);
      setErrorMessage(ai.unableToReachPolicyRoute);
    }
  }

  async function resetWorkspacePolicy() {
    if (!workspaceOverrideActive) {
      return;
    }

    if (!window.confirm('Reset this workspace override and inherit the global AI provider policy again?')) {
      return;
    }

    setIsResettingPolicy(true);
    setErrorMessage(null);
    setStatusMessage(ai.refreshing);

    try {
      const response = await fetch('/bff/admin/providers/policy/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<AiProviderPolicyResetResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsResettingPolicy(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? ai.policySaveFailedShort);
        return;
      }

      setIsResettingPolicy(false);
      setStatusMessage(
        payload.data.resetApplied
          ? `Reset workspace override at ${formatUtcDateTime(payload.data.resetAt)}.`
          : ai.policySavedShort,
      );
      router.refresh();
    } catch {
      setIsResettingPolicy(false);
      setStatusMessage(null);
      setErrorMessage(ai.unableToReachPolicyResetRoute);
    }
  }

  async function rotateOpenRouterKey() {
    if (!advancedRotateSecret.trim()) {
      setErrorMessage(ai.configureKey);
      setStatusMessage(null);
      return;
    }

    if (!platformOpenRouterCred) {
      setErrorMessage(ai.noProviderCredentials);
      setStatusMessage(null);
      return;
    }

    setIsRotatingKey(true);
    setErrorMessage(null);
    setStatusMessage(ai.refreshing);

    try {
      const response = await fetch('/bff/providers/credentials/rotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credentialId: platformOpenRouterCred.id, secret: advancedRotateSecret.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<ProviderCredentialMutationResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsRotatingKey(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? ai.policySaveFailedShort);
        return;
      }

      setAdvancedRotateSecret('');
      setIsRotatingKey(false);
      setStatusMessage(`Rotated at ${formatUtcDateTime(payload.data.credential.updatedAt)}.`);
      router.refresh();
    } catch {
      setIsRotatingKey(false);
      setStatusMessage(null);
      setErrorMessage(ai.unableToReachServer);
    }
  }

  async function revokeCredential(credentialId: string) {
    if (!window.confirm('Revoke this provider credential? The platform will stop routing through it immediately.')) {
      return;
    }

    setIsRevokingId(credentialId);
    setErrorMessage(null);
    setStatusMessage(ai.refreshing);

    try {
      const response = await fetch('/bff/providers/credentials/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credentialId }),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<ProviderCredentialRevokeResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsRevokingId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? ai.policySaveFailedShort);
        return;
      }

      setIsRevokingId(null);
      setStatusMessage(`Revoked at ${formatUtcDateTime(payload.data.revokedAt)}.`);
      router.refresh();
    } catch {
      setIsRevokingId(null);
      setStatusMessage(null);
      setErrorMessage(ai.unableToReachServer);
    }
  }

  return (
    <div className="admin-feature-flags-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      {/* A. Primary: Platform AI routing */}
      <section className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <span className="micro-label">{ai.aiRouting}</span>
              <span className={status.ok ? 'tag' : 'tag warn'}>{statusLabel}</span>
        </div>
        <p style={{ marginTop: 0 }}>{ai.providerRouting}</p>
        {isConnectedSession ? (
          <>
            <div className="admin-ticket-editor">
              <label className="admin-ticket-field">
                <span className="micro-label">{ai.provider}</span>
                <select
                  value={quickProvider}
                  onChange={(event) => {
                    const provider = event.target.value === 'routerai' ? 'routerai' : 'openrouter';
                    setQuickProvider(provider);
                  }}
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="routerai">RouterAI</option>
                </select>
              </label>
              <label className="admin-ticket-field">
                <span className="micro-label">{ai.apiKey}</span>
                <input
                  type="password"
                  placeholder={platformQuickProviderCred ? 'Enter new key to rotate…' : quickProvider === 'openrouter' ? 'sk-or-…' : 'RouterAI API key'}
                  value={quickSecret}
                  onChange={(event) => setQuickSecret(event.target.value)}
                />
              </label>
            </div>
            <div className="admin-user-actions">
              <button
                className="btn-primary"
                disabled={isSavingAndActivating || !canManagePlatform || (!platformQuickProviderCred && !quickSecret.trim())}
                onClick={() => void saveAndActivate()}
                type="button"
              >
                {isSavingAndActivating ? ai.saving : platformQuickProviderCred ? (quickSecret.trim() ? ai.apply : ai.activate) : ai.save}
              </button>
            </div>
          </>
        ) : (
          <p>{ai.checkConnection}</p>
        )}
      </section>

      {/* B. Current Routing Status */}
      <section className="panel">
        <span className="micro-label">{ai.status}</span>
        <div className="mini-list">
          <div className="list-item">
            <strong>{ai.provider}</strong>
            <p>{(governance.policy.defaultProvider ?? governance.policy.providers.join(', ')) || ai.none}</p>
          </div>
          <div className="list-item">
            <strong>{ai.routingMode}</strong>
            <p>{governance.policy.mode}</p>
          </div>
          <div className="list-item">
            <strong>{ai.platformManaged}</strong>
            <p>{governance.policy.allowPlatformManaged ? ai.enabled : ai.disabled}</p>
          </div>
          <div className="list-item">
            <strong>BYOK</strong>
            <p>{governance.policy.allowBringYourOwnKey ? ai.enabled : ai.disabled}</p>
          </div>
          <div className="list-item">
            <strong>{ai.defaultModel}</strong>
            <p>{governance.policy.defaultModel ?? ai.platformSelected}</p>
          </div>
          <div className="list-item">
            <strong>{ai.platformKey}</strong>
            <p>{platformActiveProviderCred ? (platformActiveProviderCred.secretPreview ?? ai.enabled) : ai.disabled}</p>
          </div>
          <div className="list-item">
            <strong>{ai.lastUpdated}</strong>
            <p>{formatUtcDateTime(governance.policy.updatedAt)}</p>
          </div>
          {lastPolicyChange ? (
            <div className="list-item">
              <strong>{ai.lastChange}</strong>
              <p className="list-muted">{lastPolicyChange.summary} — {formatUtcDateTime(lastPolicyChange.occurredAt)}</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* C. Advanced — emergency use only */}
      <section className="panel">
        <button
          className="btn-ghost"
          onClick={() => setShowAdvanced((v) => !v)}
          type="button"
          style={{ marginBottom: showAdvanced ? '1rem' : 0 }}
        >
          {showAdvanced ? ai.cancel : ai.advancedEmergencyUse}
        </button>

        {showAdvanced ? (
          <div className="split-grid">
            {/* Advanced block 1: Emergency manual policy editor */}
            <article className="panel">
              <span className="micro-label">{ai.advancedEmergencyUse}</span>
              <h2>{ai.manualPolicyEditor}</h2>
              <p className="list-muted">{ai.configuration}</p>
              {isConnectedSession ? (
                <>
                  <div className="admin-ticket-editor">
                    <label className="admin-ticket-field"><span className="micro-label">{ai.routingMode}</span><select onChange={(event) => setPolicyState((c) => ({ ...c, mode: event.target.value as AiAccessPolicyMode }))} value={policyState.mode}><option value="platform_only">platform_only</option><option value="user_key_optional">user_key_optional</option><option value="user_key_required">user_key_required</option><option value="admin_approved_user_key">admin_approved_user_key</option><option value="enterprise_managed">enterprise_managed</option></select></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.providerPolicies}</span><input onChange={(event) => setPolicyState((c) => ({ ...c, providersText: event.target.value }))} value={policyState.providersText} /></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.defaultProvider}</span><select onChange={(event) => setPolicyState((c) => ({ ...c, defaultProvider: event.target.value }))} value={policyState.defaultProvider}><option value="">{ai.platformSelected}</option>{governance.providers.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.displayName}</option>)}</select></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.defaultModel}</span><input onChange={(event) => setPolicyState((c) => ({ ...c, defaultModel: event.target.value }))} value={policyState.defaultModel} /></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.modelPolicies}</span><input onChange={(event) => setPolicyState((c) => ({ ...c, allowedModelTagsText: event.target.value }))} value={policyState.allowedModelTagsText} /></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.reason}</span><textarea rows={3} onChange={(event) => setPolicyState((c) => ({ ...c, reason: event.target.value }))} value={policyState.reason} /></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.platformManaged}</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowPlatformManaged: event.target.value === 'true' }))} value={String(policyState.allowPlatformManaged)}><option value="true">{ai.enabled}</option><option value="false">{ai.disabled}</option></select></label>
                    <label className="admin-ticket-field"><span className="micro-label">BYOK</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowBringYourOwnKey: event.target.value === 'true' }))} value={String(policyState.allowBringYourOwnKey)}><option value="true">{ai.enabled}</option><option value="false">{ai.disabled}</option></select></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.providerRouting}</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowDirectProviderMode: event.target.value === 'true' }))} value={String(policyState.allowDirectProviderMode)}><option value="false">{ai.disabled}</option><option value="true">{ai.enabled}</option></select></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.credentials}</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowWorkspaceSharedCredentials: event.target.value === 'true' }))} value={String(policyState.allowWorkspaceSharedCredentials)}><option value="true">{ai.enabled}</option><option value="false">{ai.disabled}</option></select></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.actions}</span><select onChange={(event) => setPolicyState((c) => ({ ...c, requireAdminApproval: event.target.value === 'true' }))} value={String(policyState.requireAdminApproval)}><option value="true">{ai.enabled}</option><option value="false">{ai.disabled}</option></select></label>
                    <label className="admin-ticket-field"><span className="micro-label">{ai.model}</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowVisionOnUserKeys: event.target.value === 'true' }))} value={String(policyState.allowVisionOnUserKeys)}><option value="true">{ai.enabled}</option><option value="false">{ai.disabled}</option></select></label>
                  </div>
                  <div className="admin-user-actions">
                    <button className="btn-primary" disabled={isSavingPolicy || isResettingPolicy || !canManagePlatform} onClick={() => void savePolicy()} type="button">{isSavingPolicy ? ai.saving : ai.savePolicy}</button>
                    {workspaceOverrideActive ? (
                      <button className="btn-ghost" disabled={isSavingPolicy || isResettingPolicy || !canManagePlatform} onClick={() => void resetWorkspacePolicy()} type="button">
                        {isResettingPolicy ? ai.refreshing : ai.resetToGlobal}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : <p>{ai.signInAdminToOverride}</p>}
            </article>

            {/* Advanced block 2: Platform credential maintenance */}
            <article className="panel">
              <span className="micro-label">{ai.credentialMaintenance}</span>
              <h2>{ai.platformKeys}</h2>
              {platformOpenRouterCred || platformRouterAiCred ? (
                <>
                  <div className="mini-list">
                    {[platformOpenRouterCred, platformRouterAiCred].filter(Boolean).map((credential) => credential ? (
                      <div className="list-item" key={credential.id}>
                        <strong>{credential.provider}</strong>
                        <p>
                          {credential.secretPreview ?? ai.enabled} · {credential.validationStatus}
                          {credential.validationMessage ? ` — ${credential.validationMessage}` : ''} · {formatUtcDateTime(credential.updatedAt)}
                        </p>
                      </div>
                    ) : null)}
                  </div>
                  {isConnectedSession ? (
                    <>
                      <div className="admin-ticket-editor" style={{ marginTop: '0.75rem' }}>
                        <label className="admin-ticket-field">
                          <span className="micro-label">{ai.configureKey}</span>
                          <input
                            type="password"
                            placeholder={ai.usePlatformKey}
                            value={advancedRotateSecret}
                            onChange={(event) => setAdvancedRotateSecret(event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="admin-user-actions">
                        <button
                          className="btn-primary"
                          disabled={isRotatingKey || !canRotate || !advancedRotateSecret.trim()}
                          onClick={() => void rotateOpenRouterKey()}
                          type="button"
                        >
                          {isRotatingKey ? ai.refreshing : ai.rotateKey}
                        </button>
                        <button
                          className="btn-ghost"
                          disabled={isRevokingId === platformOpenRouterCred.id || !canRotate}
                          onClick={() => void revokeCredential(platformOpenRouterCred.id)}
                          type="button"
                        >
                          {isRevokingId === platformOpenRouterCred.id ? ai.refreshing : ai.revokeKey}
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <p className="list-muted">{ai.noProviderCredentials}</p>
              )}
            </article>
          </div>
        ) : null}
      </section>
    </div>
  );
}
