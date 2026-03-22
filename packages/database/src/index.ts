export const databaseSchemas = {
  auth: ['users', 'accounts', 'sessions', 'mfa_methods'],
  workspaces: ['workspaces', 'workspace_memberships', 'workspace_invites'],
  billing: ['plans', 'plan_prices', 'subscriptions', 'payments', 'invoices'],
  entitlements: ['entitlements', 'entitlement_overrides', 'quota_counters'],
  controlPlane: ['feature_flags', 'remote_config_versions', 'extension_compatibility_rules'],
  observability: ['audit_logs', 'activity_logs', 'domain_events', 'security_events'],
} as const;
