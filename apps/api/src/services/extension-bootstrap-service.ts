import {
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
      workspaceId: request.workspaceId,
      planCode: request.planCode,
    },
  });
}
