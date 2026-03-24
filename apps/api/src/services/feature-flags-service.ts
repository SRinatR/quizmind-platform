import { type FeatureFlagDefinition } from '@quizmind/contracts';

import { type FeatureFlagRecord } from '../feature-flags/feature-flag.repository';

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function mapFeatureFlagRecordToDefinition(record: FeatureFlagRecord): FeatureFlagDefinition {
  const enabledOverrides = record.overrides.filter((override) => override.enabled);
  const allowUsers = uniqueStrings(enabledOverrides.map((override) => override.userId));
  const allowWorkspaces = uniqueStrings(enabledOverrides.map((override) => override.workspaceId));

  return {
    key: record.key,
    status: record.status,
    description: record.description,
    enabled: record.enabled,
    rolloutPercentage: record.rolloutPercentage ?? undefined,
    ...(allowUsers.length > 0 ? { allowUsers } : {}),
    ...(allowWorkspaces.length > 0 ? { allowWorkspaces } : {}),
    minimumExtensionVersion: record.minimumExtensionVersion ?? undefined,
  };
}
