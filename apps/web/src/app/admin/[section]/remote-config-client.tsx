'use client';

import { resolveRemoteConfig } from '@quizmind/extension';
import {
  type PrimitiveValue,
  remoteConfigScopes,
  type RemoteConfigActivateVersionResult,
  type RemoteConfigContext,
  type RemoteConfigLayer,
  type RemoteConfigPublishResponse,
  type RemoteConfigVersionSummary,
} from '@quizmind/contracts';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { type RemoteConfigStateSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

type RemoteConfigScope = (typeof remoteConfigScopes)[number];

interface EditableLayer {
  id: string;
  scope: RemoteConfigScope;
  priority: string;
  conditionsText: string;
  valuesText: string;
}

interface RemoteConfigClientProps {
  initialState: RemoteConfigStateSnapshot;
  isConnectedSession: boolean;
}

interface RouteResponse {
  ok: boolean;
  data?: RemoteConfigPublishResponse;
  error?: {
    message?: string;
  };
}

interface ActivateRouteResponse {
  ok: boolean;
  data?: RemoteConfigActivateVersionResult;
  error?: {
    message?: string;
  };
}

type RemoteConfigConditionMap = NonNullable<RemoteConfigLayer['conditions']>;
type RemoteConfigValueMap = RemoteConfigLayer['values'];

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function createEditableLayer(layer: RemoteConfigLayer): EditableLayer {
  return {
    id: layer.id,
    scope: layer.scope,
    priority: String(layer.priority),
    conditionsText: stringifyJson(layer.conditions ?? {}),
    valuesText: stringifyJson(layer.values),
  };
}

function createNewEditableLayer(index: number): EditableLayer {
  return {
    id: `draft-layer-${index}`,
    scope: 'workspace',
    priority: String(index * 10),
    conditionsText: stringifyJson({
      workspaceId: 'demo-workspace',
    }),
    valuesText: stringifyJson({
      answerStyle: 'detailed',
    }),
  };
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const normalized = value.trim();

  if (!normalized) {
    return {};
  }

  const parsed = JSON.parse(normalized) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function isPrimitiveValue(value: unknown): value is PrimitiveValue {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isPrimitiveArray(value: unknown): value is PrimitiveValue[] {
  return Array.isArray(value) && value.every(isPrimitiveValue);
}

function isPrimitiveRecord(value: unknown): value is Record<string, PrimitiveValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isPrimitiveValue);
}

function parseLayerConditions(value: string): RemoteConfigConditionMap {
  const parsed = parseJsonRecord(value);
  const conditions: RemoteConfigConditionMap = {};

  for (const [key, entry] of Object.entries(parsed)) {
    if (isPrimitiveValue(entry)) {
      conditions[key] = entry;
      continue;
    }

    if (Array.isArray(entry) && entry.every((item) => typeof item === 'string')) {
      conditions[key] = entry;
      continue;
    }

    throw new Error(`Condition "${key}" must be a primitive value or string array.`);
  }

  return conditions;
}

function parseLayerValues(value: string): RemoteConfigValueMap {
  const parsed = parseJsonRecord(value);
  const resolvedValues: RemoteConfigValueMap = {};

  for (const [key, entry] of Object.entries(parsed)) {
    if (isPrimitiveValue(entry) || isPrimitiveArray(entry) || isPrimitiveRecord(entry)) {
      resolvedValues[key] = entry;
      continue;
    }

    throw new Error(
      `Value "${key}" must be a primitive, primitive array, or flat object of primitive values.`,
    );
  }

  return resolvedValues;
}

function sanitizePreviewContext(context: RemoteConfigContext): RemoteConfigContext {
  const activeFlags = Array.isArray(context.activeFlags)
    ? context.activeFlags.map((flag) => flag.trim()).filter(Boolean)
    : [];

  return {
    ...(context.environment?.trim() ? { environment: context.environment.trim() } : {}),
    ...(context.planCode?.trim() ? { planCode: context.planCode.trim() } : {}),
    ...(context.workspaceId?.trim() ? { workspaceId: context.workspaceId.trim() } : {}),
    ...(context.userId?.trim() ? { userId: context.userId.trim() } : {}),
    ...(context.extensionVersion?.trim() ? { extensionVersion: context.extensionVersion.trim() } : {}),
    ...(activeFlags.length > 0 ? { activeFlags } : {}),
  };
}

function parseLayerDrafts(
  drafts: EditableLayer[],
): { layers: RemoteConfigLayer[]; error: string | null } {
  try {
    const layers = drafts.map((draft, index) => {
      const priority = Number(draft.priority);

      if (!Number.isFinite(priority)) {
        throw new Error(`Layer ${index + 1} priority must be a number.`);
      }

      const conditions = parseLayerConditions(draft.conditionsText);
      const values = parseLayerValues(draft.valuesText);

      return {
        id: draft.id.trim() || `draft-layer-${index + 1}`,
        scope: draft.scope,
        priority,
        ...(Object.keys(conditions).length > 0 ? { conditions } : {}),
        values,
      } satisfies RemoteConfigLayer;
    });

    return {
      layers,
      error: null,
    };
  } catch (error) {
    return {
      layers: [],
      error: error instanceof Error ? error.message : 'Invalid remote config JSON.',
    };
  }
}

function parseActiveFlags(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createInitialVersionLabel(initialState: RemoteConfigStateSnapshot) {
  const workspaceId = initialState.previewContext.workspaceId?.trim();

  return workspaceId ? `draft-${workspaceId}` : 'draft-global';
}

export function RemoteConfigClient({ initialState, isConnectedSession }: RemoteConfigClientProps) {
  const router = useRouter();
  const [versionLabel, setVersionLabel] = useState(() => createInitialVersionLabel(initialState));
  const [layers, setLayers] = useState<EditableLayer[]>(initialState.activeLayers.map(createEditableLayer));
  const [nextDraftIndex, setNextDraftIndex] = useState(initialState.activeLayers.length + 1);
  const [previewContext, setPreviewContext] = useState({
    environment: initialState.previewContext.environment ?? '',
    planCode: initialState.previewContext.planCode ?? '',
    workspaceId: initialState.previewContext.workspaceId ?? '',
    userId: initialState.previewContext.userId ?? '',
    extensionVersion: initialState.previewContext.extensionVersion ?? '',
    activeFlags: (initialState.previewContext.activeFlags ?? []).join(', '),
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? 'Adjust layers, inspect the resolved preview, and publish a new active version when the draft is ready.'
      : 'Persona preview supports local draft editing and preview. Sign in with a connected platform admin account to publish.',
  );
  const [lastPublished, setLastPublished] = useState<RemoteConfigPublishResponse['publishResult'] | null>(null);
  const [, startRefresh] = useTransition();
  const parsedLayers = parseLayerDrafts(layers);
  const resolvedPreview =
    parsedLayers.error === null
      ? resolveRemoteConfig(parsedLayers.layers, sanitizePreviewContext({
          environment: previewContext.environment,
          planCode: previewContext.planCode,
          workspaceId: previewContext.workspaceId,
          userId: previewContext.userId,
          extensionVersion: previewContext.extensionVersion,
          activeFlags: parseActiveFlags(previewContext.activeFlags),
        }))
      : null;

  function updateLayer(id: string, field: keyof EditableLayer, value: string) {
    setLayers((current) =>
      current.map((layer) => (layer.id === id ? { ...layer, [field]: value } : layer)),
    );
  }

  function handleAddLayer() {
    setLayers((current) => [...current, createNewEditableLayer(nextDraftIndex)]);
    setNextDraftIndex((current) => current + 1);
  }

  function handleRemoveLayer(id: string) {
    setLayers((current) => current.filter((layer) => layer.id !== id));
  }

  function handleLoadVersion(version: RemoteConfigVersionSummary) {
    setLayers(version.layers.map(createEditableLayer));
    setNextDraftIndex(version.layers.length + 1);
    setVersionLabel(`${version.versionLabel}-draft`);
    setPreviewContext((current) => ({
      ...current,
      workspaceId: version.workspaceId ?? current.workspaceId,
    }));
    setErrorMessage(null);
    setStatusMessage(`Loaded ${version.versionLabel} into the draft editor.`);
  }

  async function handleActivateVersion(version: RemoteConfigVersionSummary) {
    if (!isConnectedSession) {
      setErrorMessage('Sign in with a connected platform admin account to activate a remote config version.');
      setStatusMessage(null);
      return;
    }

    setErrorMessage(null);
    setStatusMessage(`Activating remote config version ${version.versionLabel}...`);

    try {
      const response = await fetch('/bff/admin/remote-config/activate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          versionId: version.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ActivateRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to activate the selected remote config version.');
        return;
      }

      setStatusMessage(
        `Activated ${payload.data.version.versionLabel}. Refreshing control-plane snapshot...`,
      );

      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setStatusMessage(null);
      setErrorMessage('Unable to reach the remote config activation route right now.');
    }
  }

  async function handlePublish() {
    if (!isConnectedSession) {
      setErrorMessage('Sign in with a connected platform admin account to publish remote config.');
      setStatusMessage(null);
      return;
    }

    if (!versionLabel.trim()) {
      setErrorMessage('Version label is required.');
      setStatusMessage(null);
      return;
    }

    if (parsedLayers.error) {
      setErrorMessage(parsedLayers.error);
      setStatusMessage(null);
      return;
    }

    setErrorMessage(null);
    setLastPublished(null);
    setStatusMessage(`Publishing remote config version ${versionLabel.trim()}...`);

    try {
      const response = await fetch('/bff/admin/remote-config/publish', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          versionLabel: versionLabel.trim(),
          layers: parsedLayers.layers,
          ...(previewContext.workspaceId.trim() ? { workspaceId: previewContext.workspaceId.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as RouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to publish remote config right now.');
        return;
      }

      setLastPublished(payload.data.publishResult);
      setStatusMessage(
        `Published ${payload.data.publishResult.versionLabel}. Refreshing control-plane snapshot...`,
      );

      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setStatusMessage(null);
      setErrorMessage('Unable to reach the remote config publish route right now.');
    }
  }

  return (
    <div className="admin-remote-config-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      {lastPublished ? (
        <div className="admin-support-result">
          <span className="micro-label">Latest publish</span>
          <strong>{lastPublished.versionLabel}</strong>
          <p>
            Published at {formatUtcDateTime(lastPublished.publishedAt)} with{' '}
            {lastPublished.appliedLayerCount} active layer
            {lastPublished.appliedLayerCount === 1 ? '' : 's'}.
          </p>
        </div>
      ) : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Draft</span>
          <h2>Version metadata</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Version label</span>
              <input
                onChange={(event) => setVersionLabel(event.target.value)}
                placeholder="spring-rollout-v3"
                value={versionLabel}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Environment</span>
              <input
                onChange={(event) =>
                  setPreviewContext((current) => ({
                    ...current,
                    environment: event.target.value,
                  }))
                }
                placeholder="development"
                value={previewContext.environment}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Plan code</span>
              <input
                onChange={(event) =>
                  setPreviewContext((current) => ({
                    ...current,
                    planCode: event.target.value,
                  }))
                }
                placeholder="pro"
                value={previewContext.planCode}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Workspace ID</span>
              <input
                onChange={(event) =>
                  setPreviewContext((current) => ({
                    ...current,
                    workspaceId: event.target.value,
                  }))
                }
                placeholder="workspace id"
                value={previewContext.workspaceId}
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
            <label className="admin-ticket-field">
              <span className="micro-label">Active flags</span>
              <input
                onChange={(event) =>
                  setPreviewContext((current) => ({
                    ...current,
                    activeFlags: event.target.value,
                  }))
                }
                placeholder="beta.remote-config-v2, ops.force-upgrade-banner"
                value={previewContext.activeFlags}
              />
            </label>
          </div>
          <div className="admin-user-actions">
            <button className="btn-primary" onClick={() => void handlePublish()} type="button">
              Publish version
            </button>
            <button className="btn-ghost" onClick={handleAddLayer} type="button">
              Add layer
            </button>
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Preview</span>
          <h2>Resolved output</h2>
          {parsedLayers.error ? (
            <div className="empty-state">
              <span className="micro-label">Invalid JSON</span>
              <h2>Preview is paused until the layer draft parses cleanly.</h2>
              <p>{parsedLayers.error}</p>
            </div>
          ) : (
            <div className="admin-remote-config-preview">
              <div className="list-item">
                <strong>Applied layers</strong>
                <p>{resolvedPreview?.appliedLayerIds.join(', ') || 'No layers matched the preview context.'}</p>
              </div>
              <div className="list-item">
                <strong>Resolved values</strong>
                <pre>{stringifyJson(resolvedPreview?.values ?? {})}</pre>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Layers</span>
        <h2>Active layer editor</h2>
        <div className="admin-remote-config-layers">
          {layers.map((layer, index) => (
            <article className="admin-remote-config-layer" key={layer.id}>
              <div className="billing-section-header">
                <div>
                  <span className="micro-label">Layer {index + 1}</span>
                  <h3>{layer.id}</h3>
                </div>
                <button className="btn-ghost" onClick={() => handleRemoveLayer(layer.id)} type="button">
                  Remove
                </button>
              </div>
              <div className="admin-ticket-editor">
                <label className="admin-ticket-field">
                  <span className="micro-label">Layer ID</span>
                  <input value={layer.id} onChange={(event) => updateLayer(layer.id, 'id', event.target.value)} />
                </label>
                <label className="admin-ticket-field">
                  <span className="micro-label">Scope</span>
                  <select value={layer.scope} onChange={(event) => updateLayer(layer.id, 'scope', event.target.value)}>
                    {remoteConfigScopes.map((scope) => (
                      <option key={scope} value={scope}>
                        {scope}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-ticket-field">
                  <span className="micro-label">Priority</span>
                  <input
                    value={layer.priority}
                    onChange={(event) => updateLayer(layer.id, 'priority', event.target.value)}
                  />
                </label>
                <label className="admin-ticket-field">
                  <span className="micro-label">Conditions JSON</span>
                  <textarea
                    rows={6}
                    value={layer.conditionsText}
                    onChange={(event) => updateLayer(layer.id, 'conditionsText', event.target.value)}
                  />
                </label>
                <label className="admin-ticket-field">
                  <span className="micro-label">Values JSON</span>
                  <textarea
                    rows={8}
                    value={layer.valuesText}
                    onChange={(event) => updateLayer(layer.id, 'valuesText', event.target.value)}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <span className="micro-label">History</span>
        <h2>Published versions</h2>
        {initialState.versions.length > 0 ? (
          <div className="list-stack">
            {initialState.versions.map((version) => (
              <article className="list-item" key={version.id}>
                <div className="billing-section-header">
                  <div>
                    <strong>{version.versionLabel}</strong>
                    <p>
                      Published {formatUtcDateTime(version.publishedAt)} by{' '}
                      {version.publishedBy?.displayName ?? version.publishedBy?.email ?? 'Unknown operator'}
                    </p>
                  </div>
                  <div className="tag-row">
                    <span className={version.isActive ? 'tag' : 'tag warn'}>
                      {version.isActive ? 'active' : 'inactive'}
                    </span>
                    <span className="tag">{version.workspaceId ? `workspace ${version.workspaceId}` : 'global'}</span>
                    <span className="tag">
                      {version.layers.length} layer{version.layers.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="admin-user-actions">
                  <button className="btn-ghost" onClick={() => handleLoadVersion(version)} type="button">
                    Load into draft
                  </button>
                  <button
                    className="btn-primary"
                    disabled={!isConnectedSession || version.isActive}
                    onClick={() => void handleActivateVersion(version)}
                    type="button"
                  >
                    Activate version
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No published versions are available for this workspace context yet.</p>
        )}
      </section>
    </div>
  );
}
