export { Prisma, PrismaClient } from '@prisma/client';

export const databaseSchemas = {
  auth: ['users', 'accounts', 'sessions', 'email_verifications', 'password_resets', 'mfa_methods'],
  workspaces: ['workspaces', 'workspace_memberships', 'workspace_invites'],
  billing: ['plans', 'plan_prices', 'subscriptions', 'payments', 'invoices'],
  entitlements: ['entitlements', 'entitlement_overrides', 'quota_counters'],
  controlPlane: ['feature_flags', 'remote_config_versions', 'extension_compatibility_rules'],
  observability: ['audit_logs', 'activity_logs', 'domain_events', 'security_events'],
  support: ['support_tickets', 'support_impersonation_sessions'],
} as const;
