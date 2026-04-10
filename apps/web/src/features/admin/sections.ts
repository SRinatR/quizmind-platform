import { type AccessRequirement } from '@quizmind/contracts';

export type AdminSectionGroup = 'people' | 'operations' | 'extensions' | 'control-plane';

export interface AdminSection {
  id: string;
  title: string;
  href: string;
  description: string;
  requirement: AccessRequirement;
  group: AdminSectionGroup;
  groupLabel: string;
}

export const adminSections: AdminSection[] = [
  // ── People ──────────────────────────────────────────────────────────
  {
    id: 'users',
    title: 'Users',
    href: '/admin/users',
    description: 'User directory and role assignments.',
    requirement: { permission: 'users:read' },
    group: 'people',
    groupLabel: 'People',
  },
  {
    id: 'support',
    title: 'Support',
    href: '/admin/support',
    description: 'Support ticket queue and operator context.',
    requirement: { permission: 'support:impersonate' },
    group: 'people',
    groupLabel: 'People',
  },
  {
    id: 'access-sessions',
    title: 'Access Sessions',
    href: '/admin/access-sessions',
    description: 'Recent impersonation sessions and support access logs.',
    requirement: { permission: 'support:impersonate' },
    group: 'people',
    groupLabel: 'People',
  },
  // ── Operations ───────────────────────────────────────────────────────
  {
    id: 'events',
    title: 'Events',
    href: '/admin/events',
    description: 'Audit, activity, security, and domain event streams.',
    requirement: { permission: 'audit_logs:read' },
    group: 'operations',
    groupLabel: 'Operations',
  },
  {
    id: 'security',
    title: 'Security',
    href: '/admin/security',
    description: 'Security event review and hardening checkpoints.',
    requirement: { permission: 'audit_logs:read' },
    group: 'operations',
    groupLabel: 'Operations',
  },
  {
    id: 'webhooks',
    title: 'Jobs & Webhooks',
    href: '/admin/webhooks',
    description: 'Webhook deliveries, queue bindings, and retry controls.',
    requirement: { permission: 'jobs:read' },
    group: 'operations',
    groupLabel: 'Operations',
  },
  // ── Extensions ───────────────────────────────────────────────────────
  {
    id: 'extension-fleet',
    title: 'Fleet',
    href: '/admin/extension-fleet',
    description: 'Installation health, compatibility drift, and token activity.',
    requirement: { permission: 'installations:read' },
    group: 'extensions',
    groupLabel: 'Extensions',
  },
  {
    id: 'usage',
    title: 'Usage',
    href: '/admin/usage',
    description: 'Quota counters, fleet health, and exportable usage telemetry.',
    requirement: { permission: 'usage:read' },
    group: 'extensions',
    groupLabel: 'Extensions',
  },
  {
    id: 'compatibility',
    title: 'Compatibility',
    href: '/admin/compatibility',
    description: 'Version gates, schema support, and rollout verdicts.',
    requirement: { permission: 'compatibility_rules:manage' },
    group: 'extensions',
    groupLabel: 'Extensions',
  },
  {
    id: 'bootstrap-simulator',
    title: 'Bootstrap Simulator',
    href: '/admin/bootstrap-simulator',
    description: 'Simulate bootstrap, compatibility, flags, and resolved remote config.',
    requirement: { permission: 'remote_config:read' },
    group: 'extensions',
    groupLabel: 'Extensions',
  },
  // ── Control Plane ────────────────────────────────────────────────────
  {
    id: 'feature-flags',
    title: 'Feature Flags',
    href: '/admin/feature-flags',
    description: 'Rollouts, targeting, and beta controls.',
    requirement: { permission: 'feature_flags:read' },
    group: 'control-plane',
    groupLabel: 'Control Plane',
  },
  {
    id: 'remote-config',
    title: 'Remote Config',
    href: '/admin/remote-config',
    description: 'Draft, preview, and publish extension config versions.',
    requirement: { permission: 'remote_config:publish' },
    group: 'control-plane',
    groupLabel: 'Control Plane',
  },
  {
    id: 'ai-routing',
    title: 'AI Routing',
    href: '/admin/ai-routing',
    description: 'Provider registry, platform credentials, and routing policy.',
    requirement: { permission: 'ai_providers:manage' },
    group: 'control-plane',
    groupLabel: 'Control Plane',
  },
];
