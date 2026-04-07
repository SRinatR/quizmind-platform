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

function describeKeyAccess(input?: {
  mode?: string;
  allowBringYourOwnKey?: boolean;
  requireAdminApproval?: boolean;
}): string {
  if (!input) {
    return 'Loading your AI setup\u2026';
  }

  if (!input.allowBringYourOwnKey || input.mode === 'platform_only') {
    return 'Using platform AI \u2014 no personal key required for your account.';
  }

  if (input.requireAdminApproval) {
    return 'Personal keys are supported, but your account is pending approval before you can add one.';
  }

  if (input.mode === 'user_key_required') {
    return 'A personal key is required. Add one below to enable AI features on your account.';
  }

  return 'Your personal key is active and will be used for AI requests.';
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
    'Your API keys are encrypted and stored securely. They are never shown again after saving.',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevokingId, setIsRevokingId] = useState<string | null>(null);

  const credentials = providerCredentialInventory?.items ?? [];
  const keyAccess = describeKeyAccess({
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
          ? 'Your account is pending approval before personal keys can be added.'
          : 'Personal keys are not available for your account right now.',
      );
      return;
    }

    if (!formState.secret.trim()) {
      setStatusMessage(null);
      setErrorMessage('Paste your API key to continue.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(editingCredentialId ? 'Rotating key\u2026' : 'Saving key\u2026');

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
        editingCredentialId ? '/bff/providers/credentials/rotate' : '/bff/providers/credentials',
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
        setErrorMessage(payload?.error?.message ?? 'Unable to save key right now. Please try again.');
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
          ? `${mutationResult.credential.provider} key rotated on ${formatUtcDateTime(mutationResult.credential.updatedAt)}.`
          : `${mutationResult.credential.provider} key saved on ${formatUtcDateTime(mutationResult.credential.createdAt)}.`,
      );
      router.refresh();
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the server right now. Please try again.');
    }
  }

  async function handleRevoke(credentialId: string) {
    if (!canRotate) {
      setStatusMessage(null);
      setErrorMessage('Your account cannot revoke keys right now.');
      return;
    }

    if (!window.confirm('Remove this key? It will become inactive immediately.')) {
      return;
    }

    setIsRevokingId(credentialId);
    setErrorMessage(null);
    setStatusMessage('Removing key\u2026');

    try {
      const response = await fetch('/bff/providers/credentials/revoke', {
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
        setErrorMessage(payload?.error?.message ?? 'Unable to remove the key right now. Please try again.');
        return;
      }

      setIsRevokingId(null);
      setStatusMessage(`Key removed on ${formatUtcDateTime(payload.data.revokedAt)}.`);
      router.refresh();
    } catch {
      setIsRevokingId(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the server right now. Please try again.');
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
    setStatusMessage('Paste a new key and save to replace the existing one.');
  }

  function cancelRotation() {
    setEditingCredentialId(null);
    setFormState((current) => ({
      ...current,
      secret: '',
      scopes: '',
    }));
    setErrorMessage(null);
    setStatusMessage('Your API keys are encrypted and stored securely. They are never shown again after saving.');
  }

  return (
    <>
      {statusMessage ? <section className="billing-banner billing-banner-info">{statusMessage}</section> : null}
      {errorMessage ? <section className="billing-banner billing-banner-error">{errorMessage}</section> : null}

      <section className="split-grid">
        {/* ── Provider status ── */}
        <article className="panel settings-card">
          <span className="micro-label">Available providers</span>
          <h2>AI providers</h2>
          {providerCredentialInventory ? (
            <>
              <p className="list-muted" style={{ marginTop: 0 }}>{keyAccess}</p>
              {(availableProviders.length > 0 ? availableProviders : providerCatalog?.providers ?? []).length > 0 ? (
                <div className="ai-provider-badges">
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
              {providerCredentialInventory.aiAccessPolicy.defaultProvider ? (
                <div className="kv-list" style={{ marginTop: '8px' }}>
                  <div className="kv-row">
                    <span className="kv-row__key">Default provider</span>
                    <span className="kv-row__value">{providerCredentialInventory.aiAccessPolicy.defaultProvider}</span>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <span className="micro-label">Sign in required</span>
              <h2>Sign in to manage your AI keys.</h2>
              <p>Your keys are encrypted, stored securely, and never shown in full after saving.</p>
            </div>
          )}
        </article>

        {/* ── Add / rotate key form ── */}
        <article className="panel settings-card">
          <span className="micro-label">Personal keys</span>
          <h2>{editingCredentialId ? 'Rotate key' : 'Add key'}</h2>
          {isConnectedSession && providerCredentialInventory ? (
            <>
              {!canWrite ? (
                <p className="list-muted">{keyAccess}</p>
              ) : null}
              <div className="settings-profile-form" style={{ marginTop: '8px' }}>
                <div className="form-grid">
                  <label className="form-field">
                    <span className="form-field__label">Provider</span>
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
                  <label className="form-field">
                    <span className="form-field__label">API key</span>
                    <input
                      disabled={!canWrite}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          secret: event.target.value,
                        }))
                      }
                      placeholder="Paste your API key"
                      type="password"
                      value={formState.secret}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-field__label">Access scopes</span>
                    <input
                      disabled={!canWrite}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          scopes: event.target.value,
                        }))
                      }
                      placeholder="e.g. chat, vision (leave blank for all)"
                      value={formState.scopes}
                    />
                    <span className="form-field__hint">Comma-separated. Leave blank to use all available scopes.</span>
                  </label>
                </div>
                <div className="settings-inline-actions">
                  <button className="btn-primary" disabled={isSubmitting || !canWrite} onClick={() => void handleSubmit()} type="button">
                    {isSubmitting
                      ? editingCredentialId ? 'Rotating\u2026' : 'Saving\u2026'
                      : editingCredentialId ? 'Rotate key' : 'Save key'}
                  </button>
                  {editingCredentialId ? (
                    <button className="btn-ghost" onClick={cancelRotation} type="button">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <span className="micro-label">Sign in required</span>
              <h2>Sign in to add your AI keys.</h2>
              <p>Your keys are encrypted, stored securely, and never shown in full after saving.</p>
            </div>
          )}
        </article>
      </section>

      {/* ── Key inventory ── */}
      <section className="panel settings-card">
        <div className="page-section__head">
          <span className="page-section__label">Your keys</span>
        </div>
        <h2>Key inventory</h2>
        {credentials.length > 0 ? (
          <div className="ai-credential-list">
            {credentials.map((credential) => (
              <div className="ai-credential-row" key={credential.id}>
                <div className="ai-credential-info">
                  <div className="ai-credential-title">
                    <span className="ai-credential-provider">{credential.provider}</span>
                    {credential.revokedAt ? (
                      <span className="tag-soft tag-soft--orange">removed</span>
                    ) : (
                      <span className={`tag-soft ${credential.validationStatus === 'valid' ? 'tag-soft--green' : ''}`}>
                        {credential.validationStatus}
                      </span>
                    )}
                  </div>
                  <p className="ai-credential-meta">
                    {credential.secretPreview ?? 'preview unavailable'}
                    {credential.scopes.length > 0 ? ` \u00b7 ${credential.scopes.join(', ')}` : ''}
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
                      {isRevokingId === credential.id ? 'Removing\u2026' : 'Remove'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="micro-label">No keys yet</span>
            <h2>No personal keys connected.</h2>
            <p>
              {providerCredentialInventory?.aiAccessPolicy.allowBringYourOwnKey
                ? 'Add a key above to use your own AI provider account.'
                : 'Your account uses platform-managed AI. No personal key is needed.'}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
