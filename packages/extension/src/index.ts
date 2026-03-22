import {
  type CompatibilityHandshake,
  type CompatibilityResult,
  type ExtensionBootstrapPayload,
  type FeatureFlagDefinition,
  type RemoteConfigContext,
  type RemoteConfigLayer,
  type ResolvedRemoteConfig,
} from '@quizmind/contracts';

export interface CompatibilityPolicy {
  minimumVersion: string;
  recommendedVersion: string;
  supportedSchemaVersions: string[];
  requiredCapabilities?: string[];
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
    return {
      status: 'unsupported',
      minimumVersion: policy.minimumVersion,
      recommendedVersion: policy.recommendedVersion,
      supportedSchemaVersions: policy.supportedSchemaVersions,
      reason: 'Extension version is below the minimum supported version.',
    };
  }

  if (!policy.supportedSchemaVersions.includes(handshake.schemaVersion)) {
    return {
      status: 'supported_with_warnings',
      minimumVersion: policy.minimumVersion,
      recommendedVersion: policy.recommendedVersion,
      supportedSchemaVersions: policy.supportedSchemaVersions,
      reason: 'Config schema version is not a preferred match.',
    };
  }

  const missingCapabilities = (policy.requiredCapabilities ?? []).filter(
    (capability) => !handshake.capabilities.includes(capability),
  );

  if (missingCapabilities.length > 0) {
    return {
      status: 'deprecated',
      minimumVersion: policy.minimumVersion,
      recommendedVersion: policy.recommendedVersion,
      supportedSchemaVersions: policy.supportedSchemaVersions,
      reason: `Missing capabilities: ${missingCapabilities.join(', ')}`,
    };
  }

  return {
    status: compareSemver(handshake.extensionVersion, policy.recommendedVersion) < 0
      ? 'supported_with_warnings'
      : 'supported',
    minimumVersion: policy.minimumVersion,
    recommendedVersion: policy.recommendedVersion,
    supportedSchemaVersions: policy.supportedSchemaVersions,
  };
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
