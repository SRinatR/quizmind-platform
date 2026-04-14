'use client';

import {
  type AiAccessPolicyMode,
  type AiProvider,
  type AiProviderPolicyUpdateRequest,
  type AiProviderPolicyUpdateResult,
  type AiProviderPolicyResetResult,
  type CredentialOwnerType,
  type ProviderCredentialCreateRequest,
  type ProviderCredentialMutationResult,
  type ProviderCredentialRevokeResult,
  type ProviderCredentialRotateRequest,
} from '@quizmind/contracts';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { formatUtcDateTime } from '../../../lib/datetime';
import { type AdminProviderGovernanceStateSnapshot } from '../../../lib/api';

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

function resolveCredentialPolicyBlockReason(input: {
  ownerType: CredentialOwnerType;
  policy: AdminProviderGovernanceStateSnapshot['policy'];
}): string | null {
  if (input.ownerType === 'platform') {
    return null;
  }

  if (!input.policy.allowBringYourOwnKey || input.policy.mode === 'platform_only') {
    return `Current mode is ${input.policy.mode}. Non-platform credentials are not effective until BYOK is enabled.`;
  }

  if (input.policy.requireAdminApproval) {
    return 'BYOK policy is currently blocked by required admin approval.';
  }

  if (input.ownerType === 'workspace' && !input.policy.allowWorkspaceSharedCredentials) {
    return 'Workspace-shared credentials are disabled by policy.';
  }

  return null;
}

function deriveStatus(governance: AdminProviderGovernanceStateSnapshot): { label: string; ok: boolean } {
  const { policy, items } = governance;
  const hasKey = items.some(
    (item) => item.provider === 'openrouter' && item.ownerType === 'platform' && !item.revokedAt,
  );

  if (!hasKey) {
    return { label: 'OpenRouter key missing', ok: false };
  }

  const policyOk =
    policy.mode === 'platform_only' &&
    policy.allowPlatformManaged === true &&
    policy.allowBringYourOwnKey === false &&
    policy.allowDirectProviderMode === false &&
    (policy.allowWorkspaceSharedCredentials ?? false) === false &&
    (policy.requireAdminApproval ?? false) === false &&
    policy.providers.length === 1 &&
    policy.providers[0] === 'openrouter' &&
    policy.defaultProvider === 'openrouter';

  if (!policyOk) {
    return { label: 'Policy not locked to platform-only', ok: false };
  }

  return { label: 'OpenRouter routing active', ok: true };
}

export function AdminAiProvidersClient({ governance, isConnectedSession }: Props) {
  const router = useRouter();

  // Primary action state
  const [quickSecret, setQuickSecret] = useState('');
  const [quickModel, setQuickModel] = useState(() => {
    const openrouterModels = governance.models.filter((m) => m.provider === 'openrouter');
    return (
      governance.policy.defaultModel ??
      openrouterModels.find((m) => m.capabilityTags.includes('text'))?.modelId ??
      openrouterModels[0]?.modelId ??
      ''
    );
  });
  const [isSavingAndActivating, setIsSavingAndActivating] = useState(false);

  // Shared status
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Advanced section
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [policyState, setPolicyState] = useState(() => createPolicyState(governance));
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [isResettingPolicy, setIsResettingPolicy] = useState(false);
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [isSubmittingCredential, setIsSubmittingCredential] = useState(false);
  const [isRevokingId, setIsRevokingId] = useState<string | null>(null);
  const [credentialState, setCredentialState] = useState({
    provider: governance.providers[0]?.provider ?? 'openrouter',
    ownerType: 'platform' as CredentialOwnerType,
    ownerId: '',
    label: '',
    scopes: '',
    secret: '',
  });

  const canManagePlatform = governance.accessDecision.allowed;
  const canWriteCredentials = governance.writeDecision.allowed || canManagePlatform;
  const canRotate = governance.rotateDecision.allowed || canManagePlatform;
  const credentialPolicyBlockReason = resolveCredentialPolicyBlockReason({
    ownerType: credentialState.ownerType,
    policy: governance.policy,
  });
  const canSubmitCredential =
    editingCredentialId !== null
      ? canRotate && !credentialPolicyBlockReason
      : credentialState.ownerType === 'platform'
        ? canManagePlatform
        : canWriteCredentials && !credentialPolicyBlockReason;
  const workspaceOverrideActive = governance.policy.scopeType === 'workspace';
  const openrouterModels = governance.models.filter((m) => m.provider === 'openrouter');
  const platformOpenRouterCred = governance.items
    .filter((item) => item.provider === 'openrouter' && item.ownerType === 'platform' && !item.revokedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
  const status = deriveStatus(governance);

  async function saveAndActivate() {
    if (!quickSecret.trim()) {
      setErrorMessage('OpenRouter API key is required.');
      setStatusMessage(null);
      return;
    }

    setIsSavingAndActivating(true);
    setErrorMessage(null);
    setStatusMessage('Saving and activating OpenRouter routing...');

    try {
      const response = await fetch('/bff/admin/ai-routing/openrouter/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: quickSecret.trim(), defaultModel: quickModel || null }),
      });

      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<{ credentialUpdatedAt: string; policyUpdatedAt: string }> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSavingAndActivating(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to activate OpenRouter routing.');
        return;
      }

      setQuickSecret('');
      setIsSavingAndActivating(false);
      setStatusMessage(`Activated at ${formatUtcDateTime(payload.data.policyUpdatedAt)}.`);
      router.refresh();
    } catch {
      setIsSavingAndActivating(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the server.');
    }
  }

  async function savePolicy() {
    const providers = normalizeCsv(policyState.providersText).filter((provider): provider is AiProvider =>
      governance.providers.some((entry) => entry.provider === provider),
    );

    if (providers.length === 0) {
      setStatusMessage(null);
      setErrorMessage('At least one valid provider must remain enabled.');
      return;
    }

    setIsSavingPolicy(true);
    setErrorMessage(null);
    setStatusMessage('Saving AI provider policy...');

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
        setErrorMessage(payload?.error?.message ?? 'Unable to save AI provider policy.');
        return;
      }

      setIsSavingPolicy(false);
      setStatusMessage(`Saved AI provider policy at ${formatUtcDateTime(payload.data.updatedAt)}.`);
      router.refresh();
    } catch {
      setIsSavingPolicy(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the AI provider policy route.');
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
    setStatusMessage('Resetting workspace AI provider policy...');

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
        setErrorMessage(payload?.error?.message ?? 'Unable to reset the workspace AI provider policy.');
        return;
      }

      setIsResettingPolicy(false);
      setStatusMessage(
        payload.data.resetApplied
          ? `Reset workspace override at ${formatUtcDateTime(payload.data.resetAt)}.`
          : 'Workspace already inherits the global AI provider policy.',
      );
      router.refresh();
    } catch {
      setIsResettingPolicy(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the AI provider policy reset route.');
    }
  }

  async function submitCredential() {
    if (!credentialState.secret.trim()) {
      setStatusMessage(null);
      setErrorMessage('Secret is required.');
      return;
    }

    setIsSubmittingCredential(true);
    setErrorMessage(null);
    setStatusMessage(editingCredentialId ? 'Rotating provider credential...' : 'Saving provider credential...');

    try {
      const requestBody: ProviderCredentialCreateRequest | ProviderCredentialRotateRequest = editingCredentialId
        ? { credentialId: editingCredentialId, secret: credentialState.secret.trim(), scopes: normalizeCsv(credentialState.scopes) }
        : {
            provider: credentialState.provider,
            ownerType: credentialState.ownerType,
            ...(credentialState.ownerId.trim() ? { ownerId: credentialState.ownerId.trim() } : {}),
            ...(credentialState.label.trim() ? { label: credentialState.label.trim() } : {}),
            secret: credentialState.secret.trim(),
            scopes: normalizeCsv(credentialState.scopes),
          };
      const response = await fetch(editingCredentialId ? '/bff/providers/credentials/rotate' : '/bff/providers/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<ProviderCredentialMutationResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSubmittingCredential(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to save provider credential.');
        return;
      }

      setCredentialState((current) => ({ ...current, ownerType: 'platform', ownerId: '', label: '', scopes: payload.data!.credential.scopes.join(', '), secret: '' }));
      setEditingCredentialId(null);
      setIsSubmittingCredential(false);
      setStatusMessage(`Saved provider credential at ${formatUtcDateTime(payload.data.credential.updatedAt)}.`);
      router.refresh();
    } catch {
      setIsSubmittingCredential(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the provider credential route.');
    }
  }

  async function revokeCredential(credentialId: string) {
    if (!window.confirm('Revoke this provider credential?')) {
      return;
    }

    setIsRevokingId(credentialId);
    setErrorMessage(null);
    setStatusMessage('Revoking provider credential...');

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
        setErrorMessage(payload?.error?.message ?? 'Unable to revoke provider credential.');
        return;
      }

      setIsRevokingId(null);
      setStatusMessage(`Revoked provider credential at ${formatUtcDateTime(payload.data.revokedAt)}.`);
      router.refresh();
    } catch {
      setIsRevokingId(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the revoke route.');
    }
  }

  return (
    <div className="admin-feature-flags-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      {/* A. Primary: OpenRouter Platform Key */}
      <section className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <span className="micro-label">OpenRouter Platform Key</span>
          <span className={status.ok ? 'tag' : 'tag warn'}>{status.label}</span>
        </div>
        <p style={{ marginTop: 0 }}>Paste your OpenRouter key here. The platform will use it for all users.</p>
        {isConnectedSession ? (
          <>
            <div className="admin-ticket-editor">
              <label className="admin-ticket-field">
                <span className="micro-label">Provider</span>
                <input disabled value="OpenRouter (platform-managed)" readOnly />
              </label>
              <label className="admin-ticket-field">
                <span className="micro-label">API Key</span>
                <input
                  type="password"
                  placeholder={platformOpenRouterCred ? 'Enter new key to rotate…' : 'sk-or-…'}
                  value={quickSecret}
                  onChange={(event) => setQuickSecret(event.target.value)}
                />
              </label>
              {openrouterModels.length > 0 ? (
                <label className="admin-ticket-field">
                  <span className="micro-label">Default model (optional)</span>
                  <select value={quickModel} onChange={(event) => setQuickModel(event.target.value)}>
                    <option value="">platform-selected</option>
                    {openrouterModels.map((m) => (
                      <option key={m.modelId} value={m.modelId}>{m.displayName}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="admin-user-actions">
              <button
                className="btn-primary"
                disabled={isSavingAndActivating || !canManagePlatform || !quickSecret.trim()}
                onClick={() => void saveAndActivate()}
                type="button"
              >
                {isSavingAndActivating ? 'Saving…' : platformOpenRouterCred ? 'Rotate and Activate' : 'Save and Activate'}
              </button>
            </div>
          </>
        ) : (
          <p>Sign in with a connected admin session to configure OpenRouter routing.</p>
        )}
      </section>

      {/* B. Current Routing Status */}
      <section className="panel">
        <span className="micro-label">Current Routing Status</span>
        <div className="mini-list">
          <div className="list-item">
            <strong>Provider</strong>
            <p>{governance.policy.defaultProvider ?? governance.policy.providers.join(', ') || 'None'}</p>
          </div>
          <div className="list-item">
            <strong>Mode</strong>
            <p>{governance.policy.mode}</p>
          </div>
          <div className="list-item">
            <strong>Platform-managed</strong>
            <p>{governance.policy.allowPlatformManaged ? 'enabled' : 'disabled'}</p>
          </div>
          <div className="list-item">
            <strong>BYOK</strong>
            <p>{governance.policy.allowBringYourOwnKey ? 'enabled' : 'disabled'}</p>
          </div>
          <div className="list-item">
            <strong>Default model</strong>
            <p>{governance.policy.defaultModel ?? 'platform-selected'}</p>
          </div>
          <div className="list-item">
            <strong>Platform key</strong>
            <p>{platformOpenRouterCred ? (platformOpenRouterCred.secretPreview ?? 'configured') : 'not configured'}</p>
          </div>
          <div className="list-item">
            <strong>Last updated</strong>
            <p>{formatUtcDateTime(governance.policy.updatedAt)}</p>
          </div>
        </div>
      </section>

      {/* C. Advanced */}
      <section className="panel">
        <button
          className="btn-ghost"
          onClick={() => setShowAdvanced((v) => !v)}
          type="button"
          style={{ marginBottom: showAdvanced ? '1rem' : 0 }}
        >
          {showAdvanced ? 'Hide advanced' : 'Show advanced'}
        </button>

        {showAdvanced ? (
          <>
            <div className="split-grid">
              <article className="panel">
                <span className="micro-label">Policy</span>
                <h2>Governance context</h2>
                <div className="mini-list">
                  <div className="list-item">
                    <strong>Resolved policy</strong>
                    <p>{governance.policy.scopeType} | {governance.policy.mode}</p>
                  </div>
                  <div className="list-item">
                    <strong>Inheritance</strong>
                    <p>{workspaceOverrideActive ? 'Workspace override is active.' : 'This workspace currently inherits the global policy.'}</p>
                  </div>
                  <div className="list-item">
                    <strong>Providers</strong>
                    <p>{governance.policy.providers.join(', ') || 'None enabled'}</p>
                  </div>
                  <div className="list-item">
                    <strong>Flags</strong>
                    <p>BYOK {String(governance.policy.allowBringYourOwnKey)} | shared {String(governance.policy.allowWorkspaceSharedCredentials ?? false)} | approval {String(governance.policy.requireAdminApproval ?? false)}</p>
                  </div>
                  <div className="list-item">
                    <strong>History</strong>
                    <p>{governance.policyHistory.length} recent change{governance.policyHistory.length === 1 ? '' : 's'} in this workspace context</p>
                  </div>
                </div>
              </article>

              <article className="panel">
                <span className="micro-label">Policy</span>
                <h2>Persisted AI provider policy</h2>
                {isConnectedSession ? (
                  <>
                    <div className="admin-ticket-editor">
                      <label className="admin-ticket-field"><span className="micro-label">Mode</span><select onChange={(event) => setPolicyState((c) => ({ ...c, mode: event.target.value as AiAccessPolicyMode }))} value={policyState.mode}><option value="platform_only">platform_only</option><option value="user_key_optional">user_key_optional</option><option value="user_key_required">user_key_required</option><option value="admin_approved_user_key">admin_approved_user_key</option><option value="enterprise_managed">enterprise_managed</option></select></label>
                      <label className="admin-ticket-field"><span className="micro-label">Providers</span><input onChange={(event) => setPolicyState((c) => ({ ...c, providersText: event.target.value }))} value={policyState.providersText} /></label>
                      <label className="admin-ticket-field"><span className="micro-label">Default provider</span><select onChange={(event) => setPolicyState((c) => ({ ...c, defaultProvider: event.target.value }))} value={policyState.defaultProvider}><option value="">platform-selected</option>{governance.providers.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.displayName}</option>)}</select></label>
                      <label className="admin-ticket-field"><span className="micro-label">Default model</span><input onChange={(event) => setPolicyState((c) => ({ ...c, defaultModel: event.target.value }))} value={policyState.defaultModel} /></label>
                      <label className="admin-ticket-field"><span className="micro-label">Model tags</span><input onChange={(event) => setPolicyState((c) => ({ ...c, allowedModelTagsText: event.target.value }))} value={policyState.allowedModelTagsText} /></label>
                      <label className="admin-ticket-field"><span className="micro-label">Reason</span><textarea rows={4} onChange={(event) => setPolicyState((c) => ({ ...c, reason: event.target.value }))} value={policyState.reason} /></label>
                      <label className="admin-ticket-field"><span className="micro-label">Platform managed</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowPlatformManaged: event.target.value === 'true' }))} value={String(policyState.allowPlatformManaged)}><option value="true">enabled</option><option value="false">disabled</option></select></label>
                      <label className="admin-ticket-field"><span className="micro-label">BYOK</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowBringYourOwnKey: event.target.value === 'true' }))} value={String(policyState.allowBringYourOwnKey)}><option value="true">enabled</option><option value="false">disabled</option></select></label>
                      <label className="admin-ticket-field"><span className="micro-label">Direct provider mode</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowDirectProviderMode: event.target.value === 'true' }))} value={String(policyState.allowDirectProviderMode)}><option value="false">disabled (recommended)</option><option value="true">enabled</option></select></label>
                      <label className="admin-ticket-field"><span className="micro-label">Shared keys</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowWorkspaceSharedCredentials: event.target.value === 'true' }))} value={String(policyState.allowWorkspaceSharedCredentials)}><option value="true">enabled</option><option value="false">disabled</option></select></label>
                      <label className="admin-ticket-field"><span className="micro-label">Admin approval</span><select onChange={(event) => setPolicyState((c) => ({ ...c, requireAdminApproval: event.target.value === 'true' }))} value={String(policyState.requireAdminApproval)}><option value="true">required</option><option value="false">not required</option></select></label>
                      <label className="admin-ticket-field"><span className="micro-label">Vision on user keys</span><select onChange={(event) => setPolicyState((c) => ({ ...c, allowVisionOnUserKeys: event.target.value === 'true' }))} value={String(policyState.allowVisionOnUserKeys)}><option value="true">enabled</option><option value="false">disabled</option></select></label>
                    </div>
                    <div className="admin-user-actions">
                      <button className="btn-primary" disabled={isSavingPolicy || isResettingPolicy || !canManagePlatform} onClick={() => void savePolicy()} type="button">{isSavingPolicy ? 'Saving policy...' : 'Save policy'}</button>
                      {workspaceOverrideActive ? (
                        <button className="btn-ghost" disabled={isSavingPolicy || isResettingPolicy || !canManagePlatform} onClick={() => void resetWorkspacePolicy()} type="button">
                          {isResettingPolicy ? 'Resetting...' : 'Reset to global'}
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : <p>Sign in with a connected admin session to persist provider policy.</p>}
              </article>
            </div>

            <div className="split-grid">
              <article className="panel">
                <span className="micro-label">Credentials</span>
                <h2>{editingCredentialId ? 'Rotate provider credential' : 'Create provider credential'}</h2>
                {credentialPolicyBlockReason ? <p className="list-muted">{credentialPolicyBlockReason}</p> : null}
                <div className="admin-ticket-editor">
                  <label className="admin-ticket-field"><span className="micro-label">Provider</span><select disabled={Boolean(editingCredentialId)} onChange={(event) => setCredentialState((c) => ({ ...c, provider: event.target.value as AiProvider }))} value={credentialState.provider}>{governance.providers.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.displayName}</option>)}</select></label>
                  <label className="admin-ticket-field"><span className="micro-label">Ownership</span><select disabled={Boolean(editingCredentialId)} onChange={(event) => setCredentialState((c) => ({ ...c, ownerType: event.target.value as CredentialOwnerType, ownerId: '' }))} value={credentialState.ownerType}><option value="platform">platform</option><option disabled={!governance.policy.allowBringYourOwnKey || governance.policy.requireAdminApproval || !governance.policy.allowWorkspaceSharedCredentials} value="workspace">workspace</option>{editingCredentialId && credentialState.ownerType === 'user' ? <option value="user">user</option> : null}</select></label>
                  {!editingCredentialId && credentialState.ownerType !== 'platform' ? <label className="admin-ticket-field"><span className="micro-label">Owner ID</span><input disabled={Boolean(credentialPolicyBlockReason)} placeholder="workspace or user id" onChange={(event) => setCredentialState((c) => ({ ...c, ownerId: event.target.value }))} value={credentialState.ownerId} /></label> : null}
                  {!editingCredentialId ? <label className="admin-ticket-field"><span className="micro-label">Label (optional)</span><input disabled={Boolean(credentialPolicyBlockReason)} placeholder="e.g. Production OpenRouter Key" onChange={(event) => setCredentialState((c) => ({ ...c, label: event.target.value }))} value={credentialState.label} /></label> : null}
                  <label className="admin-ticket-field"><span className="micro-label">Scopes</span><input disabled={Boolean(credentialPolicyBlockReason)} onChange={(event) => setCredentialState((c) => ({ ...c, scopes: event.target.value }))} value={credentialState.scopes} /></label>
                  <label className="admin-ticket-field"><span className="micro-label">Secret</span><input disabled={Boolean(credentialPolicyBlockReason)} type="password" onChange={(event) => setCredentialState((c) => ({ ...c, secret: event.target.value }))} value={credentialState.secret} /></label>
                </div>
                <div className="admin-user-actions">
                  <button className="btn-primary" disabled={isSubmittingCredential || !canSubmitCredential} onClick={() => void submitCredential()} type="button">{isSubmittingCredential ? 'Saving...' : editingCredentialId ? 'Rotate key' : 'Save key'}</button>
                  {editingCredentialId ? <button className="btn-ghost" onClick={() => setEditingCredentialId(null)} type="button">Cancel rotation</button> : null}
                </div>
              </article>

              <article className="panel">
                <span className="micro-label">Provider summary</span>
                <h2>Registry and coverage</h2>
                <div className="list-stack">
                  {governance.providerBreakdown.map((provider) => (
                    <div className="list-item" key={provider.provider}>
                      <strong>{provider.displayName}</strong>
                      <p>{provider.availability} | {provider.totalCredentials} credentials</p>
                      <span className="list-muted">platform {provider.ownerBreakdown.platform} | workspace {provider.ownerBreakdown.workspace} | user {provider.ownerBreakdown.user}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="panel">
              <span className="micro-label">Inventory</span>
              <h2>Visible credentials</h2>
              {governance.items.length > 0 ? (
                <div className="settings-session-list">
                  {governance.items.map((credential) => (
                    <div className="settings-session-row" key={credential.id}>
                      <div>
                        <strong>{credential.provider} | {credential.ownerType}</strong>
                        <p className="list-muted">{credential.secretPreview ?? 'Secret preview unavailable'} | {credential.validationStatus}</p>
                        <p className="list-muted">owner {credential.ownerId} | updated {formatUtcDateTime(credential.updatedAt)}</p>
                        {credential.validationMessage ? <p className="list-muted">{credential.validationMessage}</p> : null}
                      </div>
                      <div className="billing-history-meta">
                        {credential.revokedAt ? <span className="tag warn">revoked</span> : null}
                        <span className="tag">{credential.id.slice(0, 10)}</span>
                        {!credential.revokedAt && canRotate ? <button className="btn-ghost" onClick={() => { setEditingCredentialId(credential.id); setCredentialState((c) => ({ ...c, provider: credential.provider, ownerType: credential.ownerType, ownerId: credential.ownerId, scopes: credential.scopes.join(', '), secret: '' })); }} type="button">Rotate</button> : null}
                        {!credential.revokedAt && canRotate ? <button className="btn-ghost" disabled={isRevokingId === credential.id} onClick={() => void revokeCredential(credential.id)} type="button">{isRevokingId === credential.id ? 'Revoking...' : 'Revoke'}</button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p>No provider credentials are visible in this workspace context yet.</p>}
            </article>

            <article className="panel">
              <span className="micro-label">Policy history</span>
              <h2>Recent governance changes</h2>
              {governance.policyHistory.length > 0 ? (
                <div className="settings-session-list">
                  {governance.policyHistory.map((entry) => (
                    <div className="settings-session-row" key={entry.id}>
                      <div>
                        <strong>{entry.summary}</strong>
                        <p className="list-muted">
                          {entry.scopeType} | {entry.scopeKey} | {formatUtcDateTime(entry.occurredAt)}
                        </p>
                        <p className="list-muted">
                          actor {entry.actor?.displayName ?? entry.actor?.email ?? entry.actor?.id ?? 'system'} | mode {entry.mode ?? 'n/a'} | providers {entry.providers.join(', ') || 'none'}
                        </p>
                        {entry.reason ? <p className="list-muted">{entry.reason}</p> : null}
                      </div>
                      <div className="billing-history-meta">
                        <span className={entry.eventType === 'ai_provider_policy.reset' ? 'tag warn' : 'tag'}>{entry.eventType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p>No AI provider policy changes have been logged for this workspace context yet.</p>}
            </article>
          </>
        ) : null}
      </section>
    </div>
  );
}
