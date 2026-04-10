import {
  type CompatibilityRuleDefinition,
  type ExtensionBootstrapPayload,
  type ExtensionBootstrapRequest,
  type FeatureFlagDefinition,
  type RemoteConfigLayer,
} from '@quizmind/contracts';
import { buildExtensionBootstrap, type CompatibilityPolicy } from '@quizmind/extension';

import {
  starterFlags,
  starterRemoteConfig,
} from '../bootstrap/platform-blueprint';
import { type ExtensionCompatibilityRuleRecord } from '../extension/extension-compatibility.repository';

export const defaultCompatibilityPolicy: CompatibilityPolicy = {
  minimumVersion: '1.0.0',
  recommendedVersion: '1.5.0',
  supportedSchemaVersions: ['1', '2'],
  requiredCapabilities: ['quiz-capture'],
};

export interface ExtensionBootstrapDependencies {
  compatibilityPolicy?: CompatibilityPolicy;
  flagDefinitions?: FeatureFlagDefinition[];
  remoteConfigLayers?: RemoteConfigLayer[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function mapExtensionCompatibilityRuleToPolicy(
  rule: ExtensionCompatibilityRuleRecord,
  fallback: CompatibilityPolicy = defaultCompatibilityPolicy,
): CompatibilityPolicy {
  return {
    minimumVersion: rule.minimumVersion,
    recommendedVersion: rule.recommendedVersion,
    supportedSchemaVersions:
      isStringArray(rule.supportedSchemaVersions) && rule.supportedSchemaVersions.length > 0
        ? rule.supportedSchemaVersions
        : fallback.supportedSchemaVersions,
    ...(rule.requiredCapabilities === null
      ? {}
      : isStringArray(rule.requiredCapabilities)
        ? { requiredCapabilities: rule.requiredCapabilities }
        : fallback.requiredCapabilities
          ? { requiredCapabilities: fallback.requiredCapabilities }
          : {}),
    resultStatus: rule.resultStatus,
    ...(rule.reason ? { reason: rule.reason } : {}),
  };
}

export function mapExtensionCompatibilityRuleToDefinition(
  rule: ExtensionCompatibilityRuleRecord,
): CompatibilityRuleDefinition {
  return {
    id: rule.id,
    minimumVersion: rule.minimumVersion,
    recommendedVersion: rule.recommendedVersion,
    supportedSchemaVersions: isStringArray(rule.supportedSchemaVersions) ? rule.supportedSchemaVersions : [],
    ...(rule.requiredCapabilities && isStringArray(rule.requiredCapabilities)
      ? { requiredCapabilities: rule.requiredCapabilities }
      : {}),
    resultStatus: rule.resultStatus,
    ...(rule.reason ? { reason: rule.reason } : {}),
    createdAt: rule.createdAt.toISOString(),
  };
}

export function resolveExtensionBootstrap(
  request: ExtensionBootstrapRequest,
  dependencies: ExtensionBootstrapDependencies = {},
): ExtensionBootstrapPayload {
  return buildExtensionBootstrap({
    handshake: request.handshake,
    compatibilityPolicy: dependencies.compatibilityPolicy ?? defaultCompatibilityPolicy,
    flagDefinitions: dependencies.flagDefinitions ?? starterFlags,
    remoteConfigLayers: dependencies.remoteConfigLayers ?? starterRemoteConfig,
    context: {
      environment: request.environment,
      userId: request.userId,
      planCode: request.planCode,
    },
  });
}
