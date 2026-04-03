'use client';

import {
  type AiProvider,
  type ProviderCredentialCreateRequest,
  type ProviderCredentialMutationResult,
  type ProviderCredentialRevokeResult,
  type ProviderCredentialRotateRequest,
} from '@quizmind/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { type ProviderCatalogSnapshot, type ProviderCredentialInventorySnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

interface AiAccessClientProps {
  isConnectedSession: boolean;
  providerCatalog: ProviderCatalogSnapshot | null;
  providerCredentialInventory: ProviderCredentialInventorySnapshot | null;
}

interface MutationRouteResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
  };
}

interface AiCredentialFormState {
  provider: AiProvider;
  scopes: string;
  secret: string;
}

function normalizeScopes(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function describePolicyKeyBehavior(input?: {
  mode?: string;
  allowBringYourOwnKey?: boolean;
  requireAdminApproval?: boolean;
}): string {
  if (!input) {
    return 'Policy is not loaded yet.';
  }

  if (!input.allowBringYourOwnKey || input.mode === 'platform_only') {
    return 'Platform-managed only. User keys are not used for managed AI runtime requests.';
  }

  if (input.requireAdminApproval) {
    return 'BYOK is enabled in principle, but blocked until admin approval is granted for your account.';
  }

  if (input.mode === 'user_key_required') {
    return 'User key required. Managed requests must run with useOwnKey=true and an active user credential.';
  }

  return 'BYOK is active. Your stored credentials can be used by runtime requests that opt into own-key mode.';
}

export function AiAccessClient({
  isConnectedSession,
  providerCatalog,
  providerCredentialInventory,
}: AiAccessClientProps) {
  const router = useRouter();
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [formState, setFormState] = useState<AiCredentialFormState>({
    provider: providerCredentialInventory?.aiAccessPolicy.providers[0] ?? providerCatalog?.providers[0]?.provider ?? 'openrouter',
    scopes: '',
    secret: '',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    'Manage your API keys for AI providers. Keys are stored securely and never displayed again after saving.',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevokingId, setIsRevokingId] = useState<string | null>(null);

  const credentials = providerCredentialInventory?.items ?? [];
  const policy = providerCredentialInventory?.policy ?? null;
  const policyBehavior = describePolicyKeyBehavior({
    mode: providerCredentialInventory?.aiAccessPolicy.mode,
    allowBringYourOwnKey: providerCredentialInventory?.aiAccessPolicy.allowBringYourOwnKey,
    requireAdminApproval: providerCredentialInventory?.policy.requireAdminApproval,
  });
  const canWrite = Boolean(
    providerCredentialInventory?.writeDecision.allowed &&
      providerCredentialInventory.aiAccessPolicy.allowBringYourOwnKey &&
      !providerCredentialInventory.policy.requireAdminApproval,
  );
  const canRotate = Boolean(providerCredentialInventory?.rotateDecision.allowed);
  const availableProviders = useMemo(() => {
    const allowedProviders = new Set(providerCredentialInventory?.aiAccessPolicy.providers ?? []);

    return (providerCatalog?.providers ?? []).filter((provider) => {
      if (!provider.supportsBringYourOwnKey) {
        return false;
      }

      return allowedProviders.size === 0 ? true : allowedProviders.has(provider.provider);
    });
  }, [providerCatalog?.providers, providerCredentialInventory?.aiAccessPolicy.providers]);

  async function handleSubmit() {
    if (!canWrite) {
      setStatusMessage(null);
      setErrorMessage(
        providerCredentialInventory?.policy.requireAdminApproval
          ? 'Bring-your-own-key is currently gated behind admin approval for your account.'
          : `Account policy does not allow effective BYOK writes right now (${providerCredentialInventory?.aiAccessPolicy.mode ?? 'unknown_mode'}).`,
      );
      return;
    }

    if (!formState.secret.trim()) {
      setStatusMessage(null);
      setErrorMessage('Secret is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(editingCredentialId ? 'Rotating provider credential...' : 'Saving provider credential...');

    try {
      const requestBody: ProviderCredentialCreateRequest | ProviderCredentialRotateRequest = editingCredentialId
        ? {
            credentialId: editingCredentialId,
            secret: formState.secret.trim(),
            scopes: normalizeScopes(formState.scopes),
          }
        : {
            provider: formState.provider,
            ownerType: 'user',
            secret: formState.secret.trim(),
            scopes: normalizeScopes(formState.scopes),
          };
      const response = await fetch(
        editingCredentialId ? '/api/providers/credentials/rotate' : '/api/providers/credentials',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<ProviderCredentialMutationResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to save provider credential right now.');
        return;
      }

      const mutationResult = payload.data;

      setFormState((current) => ({
        ...current,
        scopes: mutationResult.credential.scopes.join(', '),
        secret: '',
      }));
      setEditingCredentialId(null);
      setIsSubmitting(false);
      setStatusMessage(
        editingCredentialId
          ? `Rotated ${mutationResult.credential.provider} credential at ${formatUtcDateTime(mutationResult.credential.updatedAt)}.`
          : `Stored ${mutationResult.credential.provider} credential at ${formatUtcDateTime(mutationResult.credential.createdAt)}.`,
      );
      router.refresh();
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the provider credential route right now.');
    }
  }

  async function handleRevoke(credentialId: string) {
    if (!canRotate) {
      setStatusMessage(null);
      setErrorMessage('Your account cannot revoke provider credentials right now.');
      return;
    }

    if (!window.confirm('Revoke this provider credential? The key will stay in audit history but become unusable.')) {
      return;
    }

    setIsRevokingId(credentialId);
    setErrorMessage(null);
    setStatusMessage('Revoking provider credential...');

    try {
      const response = await fetch('/api/providers/credentials/revoke', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          credentialId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<ProviderCredentialRevokeResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsRevokingId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to revoke the provider credential right now.');
        return;
      }

      setIsRevokingId(null);
      setStatusMessage(`Revoked provider credential at ${formatUtcDateTime(payload.data.revokedAt)}.`);
      router.refresh();
    } catch {
      setIsRevokingId(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the revoke route right now.');
    }
  }

  function startRotation(
    credentialId: string,
    provider: AiProvider,
    scopes?: string[],
  ) {
    setEditingCredentialId(credentialId);
    setFormState((current) => ({
      ...current,
      provider,
      scopes: (scopes ?? []).join(', '),
      secret: '',
    }));
    setErrorMessage(null);
    setStatusMessage('Paste the replacement secret and submit to rotate the credential.');
  }

  function cancelRotation() {
    setEditingCredentialId(null);
    setFormState((current) => ({
      ...current,
      secret: '',
      scopes: '',
    }));
    setErrorMessage(null);
    setStatusMessage('Manage your API keys for AI providers. Keys are stored securely and never displayed again after saving.');
  }

  return (
    <>
      {statusMessage ? <section className="billing-banner billing-banner-info">{statusMessage}</section> : null}
      {errorMessage ? <section className="billing-banner billing-banner-error">{errorMessage}</section> : null}

      <section className="split-grid">
        <article className="panel settings-card">
          <span className="micro-label">AI access</span>
          <h2>Provider policy</h2>
          {providerCredentialInventory ? (
            <div className="ai-policy-grid">
              <div className="ai-policy-row">
                <span className="ai-policy-key">Current mode</span>
                <span className="ai-policy-val ai-policy-val--code">{providerCredentialInventory.aiAccessPolicy.mode}</span>
              </div>
              <div className="ai-policy-row ai-policy-row--full">
                <span className="ai-policy-key">Key behavior</span>
                <span className="ai-policy-val">{policyBehavior}</span>
              </div>
              <div className="ai-policy-row">
                <span className="ai-policy-key">Default provider</span>
                <span className="ai-policy-val">{providerCredentialInventory.aiAccessPolicy.defaultProvider ?? 'platform-selected'}</span>
              </div>
              <div className="ai-policy-row">
                <span className="ai-policy-key">Admin approval</span>
                <span className={`ai-policy-val ${providerCredentialInventory.policy.requireAdminApproval ? 'ai-policy-val--warn' : 'ai-policy-val--ok'}`}>
                  {String(providerCredentialInventory.policy.requireAdminApproval ?? false)}
                </span>
              </div>
              <div className="ai-policy-row">
                <span className="ai-policy-key">Vision on user keys</span>
                <span className="ai-policy-val">
                  {String(providerCredentialInventory.policy.allowVisionOnUserKeys ?? false)}
                </span>
              </div>
              {(providerCredentialInventory.policy.allowedModelTags ?? []).length > 0 ? (
                <div className="ai-policy-row ai-policy-row--full">
                  <span className="ai-policy-key">Allowed model tags</span>
                  <span className="ai-policy-val">
                    {providerCredentialInventory.policy.allowedModelTags?.join(', ')}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">
              <span className="micro-label">Preview</span>
              <h2>Provider governance is available after sign-in.</h2>
              <p>Connected sessions can attach encrypted provider keys to your account.</p>
            </div>
          )}
          {(availableProviders.length > 0 ? availableProviders : providerCatalog?.providers ?? []).length > 0 ? (
            <div className="ai-provider-badges">
              <span className="micro-label" style={{ opacity: 0.6, marginBottom: 6 }}>Allowed providers</span>
              <div className="tag-row">
                {(availableProviders.length > 0 ? availableProviders : providerCatalog?.providers ?? []).map((provider) => (
                  <span className="tag-soft" key={provider.provider}>
                    {provider.displayName}
                    <span className="ai-provider-avail">{provider.availability}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel settings-card">
          <span className="micro-label">AI keys</span>
          <h2>{editingCredentialId ? 'Rotate provider credential' : 'Add provider credential'}</h2>
          {isConnectedSession && providerCredentialInventory ? (
            <>
              {!canWrite ? (
                <p className="list-muted">
                  Key writes are currently blocked by policy. Effective behavior: {policyBehavior}
                </p>
              ) : null}
              <div className="admin-ticket-editor">
                <label className="admin-ticket-field">
                  <span className="micro-label">Provider</span>
                  <select
                    disabled={!canWrite || Boolean(editingCredentialId)}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        provider: event.target.value as typeof current.provider,
                      }))
                    }
                    value={formState.provider}
                  >
                    {availableProviders.map((provider) => (
                      <option key={provider.provider} value={provider.provider}>
                        {provider.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-ticket-field">
                  <span className="micro-label">Scopes</span>
                  <input
                    disabled={!canWrite}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        scopes: event.target.value,
                      }))
                    }
                    placeholder="chat, vision, routing"
                    value={formState.scopes}
                  />
                </label>
                <label className="admin-ticket-field">
                  <span className="micro-label">Secret</span>
                  <input
                    disabled={!canWrite}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        secret: event.target.value,
                      }))
                    }
                    placeholder="Paste provider API key"
                    type="password"
                    value={formState.secret}
                  />
                </label>
              </div>
              <div className="admin-user-actions">
                <button className="btn-primary" disabled={isSubmitting || !canWrite} onClick={() => void handleSubmit()} type="button">
                  {isSubmitting ? (editingCredentialId ? 'Rotating...' : 'Saving...') : editingCredentialId ? 'Rotate key' : 'Save key'}
                </button>
                {editingCredentialId ? (
                  <button className="btn-ghost" onClick={cancelRotation} type="button">
                    Cancel rotation
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <span className="micro-label">Connected mode</span>
              <h2>Sign in to manage encrypted provider credentials.</h2>
              <p>Stored keys stay platform-governed, redacted in the UI, and follow the resolved AI policy for your account.</p>
            </div>
          )}
        </article>
      </section>

      <section className="panel settings-card">
        <div className="page-section__head">
          <span className="page-section__label">Stored credentials</span>
        </div>
        <h2>Key inventory</h2>
        {credentials.length > 0 ? (
          <div className="ai-credential-list">
            {credentials.map((credential) => (
              <div className="ai-credential-row" key={credential.id}>
                <div className="ai-credential-info">
                  <div className="ai-credential-title">
                    <span className="ai-credential-provider">{credential.provider}</span>
                    <span className="tag-soft tag-soft--gray">{credential.ownerType}</span>
                    {credential.revokedAt ? <span className="tag-soft tag-soft--orange">revoked</span> : null}
                    {!credential.revokedAt ? (
                      <span className={`tag-soft ${credential.validationStatus === 'valid' ? 'tag-soft--green' : ''}`}>
                        {credential.validationStatus}
                      </span>
                    ) : null}
                  </div>
                  <p className="ai-credential-meta">
                    {credential.secretPreview ?? 'preview unavailable'}
                    {credential.scopes.length > 0 ? ` \u00b7 scopes: ${credential.scopes.join(', ')}` : ''}
                    {' \u00b7 updated '}{formatUtcDateTime(credential.updatedAt)}
                  </p>
                  {credential.validationMessage ? (
                    <p className="ai-credential-message">{credential.validationMessage}</p>
                  ) : null}
                </div>
                <div className="ai-credential-actions">
                  {!credential.revokedAt && canRotate ? (
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        startRotation(
                          credential.id,
                          credential.provider,
                          credential.scopes,
                        )
                      }
                      type="button"
                    >
                      Rotate
                    </button>
                  ) : null}
                  {!credential.revokedAt && canRotate ? (
                    <button
                      className="btn-danger"
                      disabled={isRevokingId === credential.id}
                      onClick={() => void handleRevoke(credential.id)}
                      type="button"
                    >
                      {isRevokingId === credential.id ? 'Revoking\u2026' : 'Revoke'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="micro-label">No stored keys</span>
            <h2>No provider credentials attached yet.</h2>
            <p>{policy?.reason ?? 'Platform-managed routing is the default until a BYOK credential is added and validated.'}</p>
          </div>
        )}
      </section>
    </>
  );
}
