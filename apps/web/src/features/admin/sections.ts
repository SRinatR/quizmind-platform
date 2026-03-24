import { type AccessRequirement } from '@quizmind/contracts';

export interface AdminSection {
  id: string;
  title: string;
  href: string;
  description: string;
  requirement: AccessRequirement;
}

export const adminSections: AdminSection[] = [
  {
    id: 'users',
    title: 'Users',
    href: '/admin/users',
    description: 'User directory, role assignments, and support access.',
    requirement: {
      permission: 'users:read',
    },
  },
  {
    id: 'logs',
    title: 'Audit Logs',
    href: '/admin/logs',
    description: 'Audit, activity, security, and domain event streams for ops visibility.',
    requirement: {
      permission: 'audit_logs:read',
    },
  },
  {
    id: 'webhooks',
    title: 'Jobs & Webhooks',
    href: '/admin/webhooks',
    description: 'Billing webhook deliveries, queue bindings, and retry controls for ops workflows.',
    requirement: {
      permission: 'jobs:read',
    },
  },
  {
    id: 'support',
    title: 'Support Access',
    href: '/admin/support',
    description: 'Recent impersonation sessions, support actions, and operator context.',
    requirement: {
      permission: 'support:impersonate',
    },
  },
  {
    id: 'plans',
    title: 'Plans',
    href: '/admin/plans',
    description: 'Plans, prices, entitlements, and overrides.',
    requirement: {
      permission: 'plans:manage',
    },
  },
  {
    id: 'ai-providers',
    title: 'AI Providers',
    href: '/admin/ai-providers',
    description: 'Provider registry, platform credentials, and workspace key governance.',
    requirement: {
      permission: 'ai_providers:manage',
    },
  },
  {
    id: 'usage',
    title: 'Usage Explorer',
    href: '/admin/usage',
    description: 'Quota counters, installation fleet health, and exportable usage telemetry.',
    requirement: {
      permission: 'usage:read',
    },
  },
  {
    id: 'extension-fleet',
    title: 'Extension Fleet',
    href: '/admin/extension-fleet',
    description: 'Workspace-scoped installation health, compatibility drift, and installation token activity.',
    requirement: {
      permission: 'installations:read',
    },
  },
  {
    id: 'feature-flags',
    title: 'Feature Flags',
    href: '/admin/feature-flags',
    description: 'Rollouts, targeting, and beta controls.',
    requirement: {
      permission: 'feature_flags:read',
    },
  },
  {
    id: 'compatibility',
    title: 'Compatibility',
    href: '/admin/compatibility',
    description: 'Version gates, schema support, and rollout verdicts for extension bootstrap.',
    requirement: {
      permission: 'compatibility_rules:manage',
    },
  },
  {
    id: 'extension-control',
    title: 'Extension Control',
    href: '/admin/extension-control',
    description: 'Simulate bootstrap, compatibility, flags, and resolved remote config.',
    requirement: {
      permission: 'remote_config:read',
    },
  },
  {
    id: 'remote-config',
    title: 'Remote Config',
    href: '/admin/remote-config',
    description: 'Draft, preview, and publish extension config versions.',
    requirement: {
      permission: 'remote_config:publish',
    },
  },
];
