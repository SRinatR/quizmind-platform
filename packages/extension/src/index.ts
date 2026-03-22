import { type CompatibilityHandshake, type CompatibilityResult } from '@quizmind/contracts';

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
