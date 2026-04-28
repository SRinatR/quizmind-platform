import {
  ACCESS_TOKEN_LIFETIME_MINUTES,
  EMAIL_VERIFICATION_LIFETIME_HOURS,
  PASSWORD_RESET_LIFETIME_HOURS,
  REFRESH_TOKEN_LIFETIME_DAYS,
} from '@quizmind/auth';
import { type PlatformRetentionPolicy, type PlatformRetentionPolicyUpdateRequest } from '@quizmind/contracts';

export const defaultRetentionPolicy: PlatformRetentionPolicy = {
  aiHistoryContentDays: 7,
  aiHistoryAttachmentDays: 7,
  legacyAiRequestDays: 7,
  adminLogRetentionEnabled: false,
  adminLogActivityDays: 30,
  adminLogDomainDays: 30,
  adminLogSystemDays: 30,
  adminLogAuditDays: 365,
  adminLogSecurityDays: 365,
  adminLogAdminDays: 365,
  adminLogSensitiveRetentionEnabled: false,
  authRefreshSessionDays: REFRESH_TOKEN_LIFETIME_DAYS,
  passwordResetHours: PASSWORD_RESET_LIFETIME_HOURS,
  emailVerificationHours: EMAIL_VERIFICATION_LIFETIME_HOURS,
  accessTokenMinutes: ACCESS_TOKEN_LIFETIME_MINUTES,
};

type EditableNumericField = keyof Pick<
  PlatformRetentionPolicy,
  | 'aiHistoryContentDays'
  | 'aiHistoryAttachmentDays'
  | 'adminLogActivityDays'
  | 'adminLogDomainDays'
  | 'adminLogSystemDays'
  | 'adminLogAuditDays'
  | 'adminLogSecurityDays'
  | 'adminLogAdminDays'
>;

type EditableBooleanField = keyof Pick<
  PlatformRetentionPolicy,
  'adminLogRetentionEnabled' | 'adminLogSensitiveRetentionEnabled'
>;

export const retentionPolicyRanges: Record<EditableNumericField, { min: number; max: number; step: number }> = {
  aiHistoryContentDays: { min: 1, max: 365, step: 1 },
  aiHistoryAttachmentDays: { min: 1, max: 365, step: 1 },
  adminLogActivityDays: { min: 1, max: 3650, step: 1 },
  adminLogDomainDays: { min: 1, max: 3650, step: 1 },
  adminLogSystemDays: { min: 1, max: 3650, step: 1 },
  adminLogAuditDays: { min: 30, max: 3650, step: 1 },
  adminLogSecurityDays: { min: 30, max: 3650, step: 1 },
  adminLogAdminDays: { min: 30, max: 3650, step: 1 },
};

const editableNumericFields = Object.keys(retentionPolicyRanges) as EditableNumericField[];
const editableBooleanFields: EditableBooleanField[] = ['adminLogRetentionEnabled', 'adminLogSensitiveRetentionEnabled'];
const editableFields = new Set<string>([...editableNumericFields, ...editableBooleanFields]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseIntegerField(field: EditableNumericField, value: unknown): number {
  if (!Number.isFinite(value) || typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${field} must be a finite integer number.`);
  }
  const { min, max } = retentionPolicyRanges[field];
  if (value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}.`);
  }
  return value;
}

function parseBooleanField(field: EditableBooleanField, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean.`);
  }
  return value;
}

export function parseAndNormalizeRetentionPolicy(input: unknown): PlatformRetentionPolicy {
  const source = isObject(input) ? input : {};
  const normalized: PlatformRetentionPolicy = { ...defaultRetentionPolicy };

  for (const field of editableNumericFields) {
    if (field in source) {
      normalized[field] = parseIntegerField(field, source[field]);
    }
  }

  for (const field of editableBooleanFields) {
    if (field in source) {
      normalized[field] = parseBooleanField(field, source[field]);
    }
  }

  if ('legacyAiRequestDays' in source) {
    const value = source.legacyAiRequestDays;
    if (!Number.isFinite(value) || typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365) {
      throw new Error('legacyAiRequestDays must be between 1 and 365 when provided.');
    }
    normalized.legacyAiRequestDays = value;
  }

  return normalized;
}

export function parseRetentionPolicyPatch(input: unknown): PlatformRetentionPolicyUpdateRequest {
  if (!isObject(input)) {
    throw new Error('Retention policy patch must be an object.');
  }

  const patch: PlatformRetentionPolicyUpdateRequest = {};
  for (const key of Object.keys(input)) {
    if (key === 'legacyAiRequestDays') {
      throw new Error('legacyAiRequestDays is read-only for legacy rows and cannot be updated.');
    }
    if (!editableFields.has(key)) {
      throw new Error(`Unknown retention field: ${key}.`);
    }
  }

  for (const field of editableNumericFields) {
    if (field in input) {
      patch[field] = parseIntegerField(field, input[field]);
    }
  }

  for (const field of editableBooleanFields) {
    if (field in input) {
      patch[field] = parseBooleanField(field, input[field]);
    }
  }

  return patch;
}

export function mergeRetentionPolicy(
  base: PlatformRetentionPolicy,
  patch: PlatformRetentionPolicyUpdateRequest,
): PlatformRetentionPolicy {
  return parseAndNormalizeRetentionPolicy({ ...base, ...patch });
}
