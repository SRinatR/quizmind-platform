import { type FeatureFlagDefinition } from '@quizmind/contracts';

import { type FeatureFlagRecord } from '../feature-flags/feature-flag.repository';

export function mapFeatureFlagRecordToDefinition(record: FeatureFlagRecord): FeatureFlagDefinition {
  return {
    key: record.key,
    status: record.status,
    description: record.description,
    enabled: record.enabled,
    rolloutPercentage: record.rolloutPercentage ?? undefined,
    minimumExtensionVersion: record.minimumExtensionVersion ?? undefined,
  };
}
