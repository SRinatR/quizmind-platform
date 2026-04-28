import {
  ACCESS_TOKEN_LIFETIME_MINUTES,
  EMAIL_VERIFICATION_LIFETIME_HOURS,
  PASSWORD_RESET_LIFETIME_HOURS,
  REFRESH_TOKEN_LIFETIME_DAYS,
} from '@quizmind/auth';
import { type PlatformRetentionPolicy, type PlatformRetentionPolicyUpdateRequest } from '@quizmind/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

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

type NumericField = keyof Pick<
  PlatformRetentionPolicy,
  | 'aiHistoryContentDays'
  | 'aiHistoryAttachmentDays'
  | 'legacyAiRequestDays'
  | 'adminLogActivityDays'
  | 'adminLogDomainDays'
  | 'adminLogSystemDays'
  | 'adminLogAuditDays'
  | 'adminLogSecurityDays'
  | 'adminLogAdminDays'
>;

const ranges: Record<NumericField, { min: number; max: number }> = {
  aiHistoryContentDays: { min: 1, max: 365 },
  aiHistoryAttachmentDays: { min: 1, max: 365 },
  legacyAiRequestDays: { min: 1, max: 365 },
  adminLogActivityDays: { min: 1, max: 3650 },
  adminLogDomainDays: { min: 1, max: 3650 },
  adminLogSystemDays: { min: 1, max: 3650 },
  adminLogAuditDays: { min: 30, max: 3650 },
  adminLogSecurityDays: { min: 30, max: 3650 },
  adminLogAdminDays: { min: 30, max: 3650 },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toIntegerInRange(field: NumericField, value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const candidate = Math.floor(value);
  const { min, max } = ranges[field];
  if (candidate < min || candidate > max) {
    throw new Error(`${field} must be between ${min} and ${max}.`);
  }
  return candidate;
}

export function parseAndNormalizeRetentionPolicy(input: unknown): PlatformRetentionPolicy {
  const source = isObject(input) ? input : {};
  const merged: PlatformRetentionPolicy = {
    ...defaultRetentionPolicy,
    aiHistoryContentDays: toIntegerInRange('aiHistoryContentDays', source.aiHistoryContentDays, defaultRetentionPolicy.aiHistoryContentDays),
    aiHistoryAttachmentDays: toIntegerInRange('aiHistoryAttachmentDays', source.aiHistoryAttachmentDays, defaultRetentionPolicy.aiHistoryAttachmentDays),
    legacyAiRequestDays: toIntegerInRange('legacyAiRequestDays', source.legacyAiRequestDays, defaultRetentionPolicy.legacyAiRequestDays),
    adminLogRetentionEnabled: toBoolean(source.adminLogRetentionEnabled, defaultRetentionPolicy.adminLogRetentionEnabled),
    adminLogActivityDays: toIntegerInRange('adminLogActivityDays', source.adminLogActivityDays, defaultRetentionPolicy.adminLogActivityDays),
    adminLogDomainDays: toIntegerInRange('adminLogDomainDays', source.adminLogDomainDays, defaultRetentionPolicy.adminLogDomainDays),
    adminLogSystemDays: toIntegerInRange('adminLogSystemDays', source.adminLogSystemDays, defaultRetentionPolicy.adminLogSystemDays),
    adminLogAuditDays: toIntegerInRange('adminLogAuditDays', source.adminLogAuditDays, defaultRetentionPolicy.adminLogAuditDays),
    adminLogSecurityDays: toIntegerInRange('adminLogSecurityDays', source.adminLogSecurityDays, defaultRetentionPolicy.adminLogSecurityDays),
    adminLogAdminDays: toIntegerInRange('adminLogAdminDays', source.adminLogAdminDays, defaultRetentionPolicy.adminLogAdminDays),
    adminLogSensitiveRetentionEnabled: toBoolean(source.adminLogSensitiveRetentionEnabled, defaultRetentionPolicy.adminLogSensitiveRetentionEnabled),
  };

  return merged;
}

export function normalizeRetentionPolicyUpdate(input: unknown): PlatformRetentionPolicyUpdateRequest {
  if (!isObject(input)) return {};
  return parseAndNormalizeRetentionPolicy(input);
}

export function applyRetentionDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}
