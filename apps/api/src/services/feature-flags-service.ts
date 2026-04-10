import {
  systemRoles,
  workspaceRoles,
  type FeatureFlagDefinition,
  type FeatureFlagUpdateRequest,
  type SystemRole,
  type WorkspaceRole,
} from '@quizmind/contracts';

import { type FeatureFlagRecord } from '../feature-flags/feature-flag.repository';

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

const validRoleSet = new Set<string>([...systemRoles, ...workspaceRoles]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseAllowedRoles(value: unknown): Array<SystemRole | WorkspaceRole> {
  if (!isStringArray(value)) {
    return [];
  }

  return value.filter((role): role is SystemRole | WorkspaceRole => validRoleSet.has(role));
}

function normalizeList(value?: string[] | Array<SystemRole | WorkspaceRole>) {
  return uniqueStrings(value?.map((item) => item.trim()) ?? []);
}

function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

export interface NormalizedFeatureFlagUpdate {
  key: string;
  description: string;
  status: FeatureFlagDefinition['status'];
  enabled: boolean;
  rolloutPercentage?: number;
  minimumExtensionVersion?: string;
  allowRoles: Array<SystemRole | WorkspaceRole>;
  allowUsers: string[];
}

export function normalizeFeatureFlagUpdate(
  existing: FeatureFlagDefinition,
  request?: Partial<FeatureFlagUpdateRequest>,
): NormalizedFeatureFlagUpdate {
  const rolloutPercentage = request?.rolloutPercentage ?? existing.rolloutPercentage ?? null;
  const minimumExtensionVersion =
    request && 'minimumExtensionVersion' in request
      ? normalizeOptionalString(request.minimumExtensionVersion)
      : existing.minimumExtensionVersion;

  return {
    key: existing.key,
    description: normalizeOptionalString(request?.description) ?? existing.description,
    status: request?.status ?? existing.status,
    enabled: request?.enabled ?? existing.enabled,
    ...(rolloutPercentage === null ? {} : { rolloutPercentage }),
    ...(minimumExtensionVersion ? { minimumExtensionVersion } : {}),
    allowRoles: request?.allowRoles ? parseAllowedRoles(request.allowRoles) : existing.allowRoles ?? [],
    allowUsers: request?.allowUsers ? normalizeList(request.allowUsers) : existing.allowUsers ?? [],
  };
}

export function mapFeatureFlagRecordToDefinition(record: FeatureFlagRecord): FeatureFlagDefinition {
  const enabledOverrides = (record.overrides ?? []).filter((override) => override.enabled);
  const allowUsers = uniqueStrings(enabledOverrides.map((override) => override.userId));
  const allowRoles = parseAllowedRoles(record.allowRolesJson);

  return {
    key: record.key,
    status: record.status,
    description: record.description,
    enabled: record.enabled,
    rolloutPercentage: record.rolloutPercentage ?? undefined,
    ...(allowRoles.length > 0 ? { allowRoles } : {}),
    ...(allowUsers.length > 0 ? { allowUsers } : {}),
    minimumExtensionVersion: record.minimumExtensionVersion ?? undefined,
  };
}
