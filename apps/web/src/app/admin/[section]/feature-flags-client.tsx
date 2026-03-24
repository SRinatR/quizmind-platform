'use client';

import { compareSemver, resolveFeatureFlags } from '@quizmind/extension';
import { type FeatureFlagDefinition } from '@quizmind/contracts';
import { useDeferredValue, useState } from 'react';

interface FeatureFlagsClientProps {
  flags: FeatureFlagDefinition[];
  initialPreviewContext: {
    extensionVersion?: string;
    planCode?: string;
    roles?: string[];
    userId?: string;
    workspaceId?: string;
  };
}

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

  return [flag.key, flag.description, ...(flag.allowPlans ?? []), ...(flag.allowRoles ?? [])]
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearch);
}

function describeTargeting(flag: FeatureFlagDefinition): string {
  const parts: string[] = [];

  if (flag.allowPlans?.length) {
    parts.push(`plans: ${flag.allowPlans.join(', ')}`);
  }

  if (flag.allowRoles?.length) {
    parts.push(`roles: ${flag.allowRoles.join(', ')}`);
  }

  if (flag.allowWorkspaces?.length) {
    parts.push(`workspaces: ${flag.allowWorkspaces.join(', ')}`);
  }

  if (flag.allowUsers?.length) {
    parts.push(`users: ${flag.allowUsers.join(', ')}`);
  }

  if (parts.length === 0) {
    return 'Global rollout with no explicit targeting constraints.';
  }

  return parts.join(' | ');
}

export function FeatureFlagsClient({
  flags,
  initialPreviewContext,
}: FeatureFlagsClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [previewContext, setPreviewContext] = useState({
    extensionVersion: initialPreviewContext.extensionVersion ?? '1.7.0',
    planCode: initialPreviewContext.planCode ?? '',
    roles: stringifyCsv(initialPreviewContext.roles),
    userId: initialPreviewContext.userId ?? '',
    workspaceId: initialPreviewContext.workspaceId ?? '',
  });

  const filteredFlags = flags.filter((flag) => matchesSearch(flag, deferredSearchTerm));
  const resolvedFlags = resolveFeatureFlags(flags, {
    extensionVersion: previewContext.extensionVersion.trim() || undefined,
    planCode: previewContext.planCode.trim() || undefined,
    roles: parseCsv(previewContext.roles),
    userId: previewContext.userId.trim() || undefined,
    workspaceId: previewContext.workspaceId.trim() || undefined,
  });
  const extensionVersionBlocks = filteredFlags.filter((flag) => {
    if (!flag.minimumExtensionVersion || !previewContext.extensionVersion.trim()) {
      return false;
    }

    return compareSemver(previewContext.extensionVersion.trim(), flag.minimumExtensionVersion) < 0;
  }).length;

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
              <span className="micro-label">Roles</span>
              <input
                onChange={(event) =>
                  setPreviewContext((current) => ({
                    ...current,
                    roles: event.target.value,
                  }))
                }
                placeholder="platform_admin, workspace_owner"
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
            const isActiveInPreview = resolvedFlags.includes(flag.key);
            const isVersionBlocked =
              Boolean(flag.minimumExtensionVersion) &&
              Boolean(previewContext.extensionVersion.trim()) &&
              compareSemver(previewContext.extensionVersion.trim(), flag.minimumExtensionVersion!) < 0;

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
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
