import {
  type AiAccessPolicy,
  type CompatibilityHandshake,
  type CompatibilityStatus,
  type CompatibilityResult,
  type ExtensionBootstrapPayload,
  type ExtensionBootstrapPayloadV2,
  type FeatureFlagDefinition,
  type PlanEntitlement,
  type RemoteConfigContext,
  type RemoteConfigLayer,
  type ResolvedRemoteConfig,
  type UsageQuotaHint,
} from '@quizmind/contracts';

export interface CompatibilityPolicy {
  minimumVersion: string;
  recommendedVersion: string;
  supportedSchemaVersions: string[];
  requiredCapabilities?: string[];
  resultStatus?: CompatibilityStatus;
  reason?: string;
}

function createCompatibilityResult(
  policy: CompatibilityPolicy,
  status: CompatibilityStatus,
  reason?: string,
): CompatibilityResult {
  return {
    status,
    minimumVersion: policy.minimumVersion,
    recommendedVersion: policy.recommendedVersion,
    supportedSchemaVersions: policy.supportedSchemaVersions,
    ...(reason ? { reason } : {}),
  };
}

export function compareSemver(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

export function evaluateCompatibility(
  handshake: CompatibilityHandshake,
  policy: CompatibilityPolicy,
): CompatibilityResult {
  if (compareSemver(handshake.extensionVersion, policy.minimumVersion) < 0) {
    return createCompatibilityResult(
      policy,
      'unsupported',
      'Extension version is below the minimum supported version.',
    );
  }

  if (!policy.supportedSchemaVersions.includes(handshake.schemaVersion)) {
    return createCompatibilityResult(
      policy,
      'supported_with_warnings',
      'Config schema version is not a preferred match.',
    );
  }

  const missingCapabilities = (policy.requiredCapabilities ?? []).filter(
    (capability) => !handshake.capabilities.includes(capability),
  );

  if (missingCapabilities.length > 0) {
    return createCompatibilityResult(
      policy,
      'deprecated',
      `Missing capabilities: ${missingCapabilities.join(', ')}`,
    );
  }

  const computedStatus =
    compareSemver(handshake.extensionVersion, policy.recommendedVersion) < 0
      ? 'supported_with_warnings'
      : 'supported';
  const status = policy.resultStatus && policy.resultStatus !== 'supported' ? policy.resultStatus : computedStatus;
  const reason = status !== computedStatus ? policy.reason : policy.reason ?? undefined;

  return createCompatibilityResult(policy, status, reason);
}

export function resolveFeatureFlags(
  definitions: FeatureFlagDefinition[],
  context: {
    userId?: string;
    workspaceId?: string;
    roles?: string[];
    planCode?: string;
    extensionVersion?: string;
  },
): string[] {
  return definitions
    .filter((definition) => definition.status === 'active' && definition.enabled)
    .filter((definition) => {
      if (definition.allowUsers) {
        if (!context.userId || !definition.allowUsers.includes(context.userId)) {
          return false;
        }
      }

      if (definition.allowWorkspaces) {
        if (!context.workspaceId || !definition.allowWorkspaces.includes(context.workspaceId)) {
          return false;
        }
      }

      if (definition.allowRoles) {
        if (!context.roles || !definition.allowRoles.some((role) => context.roles?.includes(role))) {
          return false;
        }
      }

      if (definition.allowPlans) {
        if (!context.planCode || !definition.allowPlans.includes(context.planCode)) {
          return false;
        }
      }

      if (definition.minimumExtensionVersion && context.extensionVersion) {
        return compareSemver(context.extensionVersion, definition.minimumExtensionVersion) >= 0;
      }

      return !definition.minimumExtensionVersion;
    })
    .map((definition) => definition.key)
    .sort();
}

function matchesLayerConditions(layer: RemoteConfigLayer, context: RemoteConfigContext): boolean {
  if (!layer.conditions) {
    return true;
  }

  return Object.entries(layer.conditions).every(([key, expected]) => {
    const actual = context[key as keyof RemoteConfigContext];

    if (Array.isArray(expected)) {
      if (Array.isArray(actual)) {
        return expected.some((value) => actual.includes(String(value)));
      }

      return expected.includes(String(actual));
    }

    return actual === expected;
  });
}

export function resolveRemoteConfig(
  layers: RemoteConfigLayer[],
  context: RemoteConfigContext,
): ResolvedRemoteConfig {
  const applied = layers
    .filter((layer) => matchesLayerConditions(layer, context))
    .sort((left, right) => left.priority - right.priority);

  const values: ResolvedRemoteConfig['values'] = {};

  for (const layer of applied) {
    for (const [key, value] of Object.entries(layer.values)) {
      values[key] = value;
    }
  }

  return {
    values,
    appliedLayerIds: applied.map((layer) => layer.id),
  };
}

export function buildExtensionBootstrap(input: {
  handshake: CompatibilityHandshake;
  compatibilityPolicy: CompatibilityPolicy;
  flagDefinitions: FeatureFlagDefinition[];
  remoteConfigLayers: RemoteConfigLayer[];
  context: RemoteConfigContext & {
    roles?: string[];
    planCode?: string;
  };
}): ExtensionBootstrapPayload {
  const compatibility = evaluateCompatibility(input.handshake, input.compatibilityPolicy);
  const featureFlags = resolveFeatureFlags(input.flagDefinitions, {
    userId: input.context.userId,
    workspaceId: input.context.workspaceId,
    roles: input.context.roles,
    planCode: input.context.planCode,
    extensionVersion: input.handshake.extensionVersion,
  });

  const remoteConfig = resolveRemoteConfig(input.remoteConfigLayers, {
    ...input.context,
    activeFlags: featureFlags,
    extensionVersion: input.handshake.extensionVersion,
  });

  return {
    compatibility,
    featureFlags,
    remoteConfig,
  };
}

export function buildExtensionBootstrapV2(input: {
  installationId: string;
  workspaceId?: string;
  handshake: CompatibilityHandshake;
  compatibilityPolicy: CompatibilityPolicy;
  flagDefinitions: FeatureFlagDefinition[];
  remoteConfigLayers: RemoteConfigLayer[];
  entitlements: PlanEntitlement[];
  quotaHints: UsageQuotaHint[];
  aiAccessPolicy: AiAccessPolicy;
  context: RemoteConfigContext & {
    roles?: string[];
    planCode?: string;
  };
  issuedAt?: string;
  refreshAfterSeconds?: number;
}): ExtensionBootstrapPayloadV2 {
  const compatibility = evaluateCompatibility(input.handshake, input.compatibilityPolicy);
  const featureFlags = resolveFeatureFlags(input.flagDefinitions, {
    userId: input.context.userId,
    workspaceId: input.context.workspaceId,
    roles: input.context.roles,
    planCode: input.context.planCode,
    extensionVersion: input.handshake.extensionVersion,
  });
  const remoteConfig = resolveRemoteConfig(input.remoteConfigLayers, {
    ...input.context,
    buildId: input.handshake.buildId,
    activeFlags: featureFlags,
    extensionVersion: input.handshake.extensionVersion,
  });
  const deprecationMessages = compatibility.reason ? [compatibility.reason] : [];
  const killSwitches = compatibility.status === 'unsupported' ? ['extension.unsupported'] : [];

  return {
    installationId: input.installationId,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    compatibility,
    entitlements: [...input.entitlements].sort((left, right) => left.key.localeCompare(right.key)),
    featureFlags,
    remoteConfig,
    quotaHints: [...input.quotaHints].sort((left, right) => left.key.localeCompare(right.key)),
    aiAccessPolicy: input.aiAccessPolicy,
    deprecationMessages,
    killSwitches,
    refreshAfterSeconds: input.refreshAfterSeconds ?? 300,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
  };
}

export * from './platform-auth';
export * from './platform-bootstrap';
export * from './platform-runtime';
export * from './platform-state';
export * from './platform-telemetry';
export * from './platform-ui';
