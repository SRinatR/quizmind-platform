import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export * from './generated/prisma/enums';
export { Prisma, PrismaClient } from './generated/prisma/client';

type PrismaAdapterFactory = NonNullable<Prisma.PrismaClientOptions['adapter']>;

export function createPrismaClientOptions(
  databaseUrl: string,
  log?: Prisma.PrismaClientOptions['log'],
): {
  adapter: PrismaAdapterFactory;
  log?: Prisma.PrismaClientOptions['log'];
} {
  return {
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    ...(log ? { log } : {}),
  };
}

export const databaseSchemas = {
  auth: ['users', 'accounts', 'sessions', 'email_verifications', 'password_resets', 'mfa_methods'],
  workspaces: ['workspaces', 'workspace_memberships', 'workspace_invites'],
  billing: [
    'plans',
    'plan_prices',
    'plan_price_provider_mappings',
    'subscriptions',
    'payments',
    'invoices',
    'coupons',
    'webhook_events',
  ],
  entitlements: ['entitlements', 'entitlement_overrides', 'quota_counters'],
  controlPlane: [
    'feature_flags',
    'remote_config_versions',
    'extension_compatibility_rules',
    'extension_installations',
    'extension_installation_sessions',
    'provider_credentials',
    'ai_provider_policies',
  ],
  observability: ['audit_logs', 'activity_logs', 'domain_events', 'security_events'],
  support: ['support_tickets', 'support_impersonation_sessions'],
} as const;
