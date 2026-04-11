import { type AccessRequirement } from '@quizmind/contracts';
import { type AdminNavGroup, type NavigationItem } from '@quizmind/ui';

export type AdminSectionGroup = 'people' | 'operations' | 'extensions' | 'control-plane';

export interface AdminSection {
  id: string;
  /** Full title shown in page headers and section cards. */
  title: string;
  /** Short label shown in the sidebar nav. Defaults to title when equal. */
  navLabel: string;
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
    navLabel: 'Users',
    href: '/admin/users',
    description: 'User directory and role assignments.',
    requirement: { permission: 'users:read' },
    group: 'people',
    groupLabel: 'People',
  },
  {
    id: 'support',
    title: 'Support',
    navLabel: 'Support',
    href: '/admin/support',
    description: 'Support ticket queue and operator context.',
    // support_tickets:manage gates the ticket queue — distinct from impersonation
    requirement: { permission: 'support_tickets:manage' },
    group: 'people',
    groupLabel: 'People',
  },
  {
    id: 'access-sessions',
    title: 'Access Sessions',
    navLabel: 'Access Sessions',
    href: '/admin/access-sessions',
    description: 'Recent support access sessions and operator activity logs.',
    // support:impersonate gates the impersonation log
    requirement: { permission: 'support:impersonate' },
    group: 'people',
    groupLabel: 'People',
  },
  // ── Operations ───────────────────────────────────────────────────────
  {
    id: 'events',
    title: 'Events',
    navLabel: 'Events',
    href: '/admin/events',
    description: 'Audit, activity, security, and domain event streams.',
    requirement: { permission: 'audit_logs:read' },
    group: 'operations',
    groupLabel: 'Operations',
  },
  {
    id: 'security',
    title: 'Security',
    navLabel: 'Security',
    href: '/admin/security',
    description: 'Security event review and hardening checkpoints.',
    requirement: { permission: 'audit_logs:read' },
    group: 'operations',
    groupLabel: 'Operations',
  },
  {
    id: 'webhooks',
    title: 'Jobs & Webhooks',
    navLabel: 'Jobs & Webhooks',
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
    navLabel: 'Fleet',
    href: '/admin/extension-fleet',
    description: 'Installation health, compatibility drift, and token activity.',
    requirement: { permission: 'installations:read' },
    group: 'extensions',
    groupLabel: 'Extensions',
  },
  {
    id: 'usage',
    title: 'Usage',
    navLabel: 'Usage',
    href: '/admin/usage',
    description: 'Quota counters, fleet health, and exportable usage telemetry.',
    requirement: { permission: 'usage:read' },
    group: 'extensions',
    groupLabel: 'Extensions',
  },
  {
    id: 'compatibility',
    title: 'Compatibility',
    navLabel: 'Compatibility',
    href: '/admin/compatibility',
    description: 'Version gates, schema support, and rollout verdicts.',
    requirement: { permission: 'compatibility_rules:manage' },
    group: 'extensions',
    groupLabel: 'Extensions',
  },
  {
    id: 'bootstrap-simulator',
    title: 'Bootstrap Simulator',
    navLabel: 'Bootstrap Sim.',
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
    navLabel: 'Feature Flags',
    href: '/admin/feature-flags',
    description: 'Rollouts, targeting, and beta controls.',
    requirement: { permission: 'feature_flags:read' },
    group: 'control-plane',
    groupLabel: 'Control Plane',
  },
  {
    id: 'remote-config',
    title: 'Remote Config',
    navLabel: 'Remote Config',
    href: '/admin/remote-config',
    description: 'Draft, preview, and publish extension config versions.',
    requirement: { permission: 'remote_config:publish' },
    group: 'control-plane',
    groupLabel: 'Control Plane',
  },
  {
    id: 'ai-routing',
    title: 'AI Routing',
    navLabel: 'AI Routing',
    href: '/admin/ai-routing',
    description: 'Provider registry, platform credentials, and routing policy.',
    requirement: { permission: 'ai_providers:manage' },
    group: 'control-plane',
    groupLabel: 'Control Plane',
  },
];

// ── Group order and labels ────────────────────────────────────────────────────

const GROUP_ORDER: AdminSectionGroup[] = ['people', 'operations', 'extensions', 'control-plane'];

const GROUP_LABELS: Record<AdminSectionGroup, string> = {
  people: 'People',
  operations: 'Operations',
  extensions: 'Extensions',
  'control-plane': 'Control Plane',
};

/**
 * Builds grouped nav from a (possibly filtered) set of admin sections.
 * Empty groups are omitted.
 */
export function buildAdminNavGroups(sections: AdminSection[]): AdminNavGroup[] {
  const groups: AdminNavGroup[] = [];

  for (const groupId of GROUP_ORDER) {
    const items: NavigationItem[] = sections
      .filter((s) => s.group === groupId)
      .map((s) => ({
        label: s.navLabel,
        href: s.href,
        requiresAuth: true,
        adminOnly: true,
      }));

    if (items.length > 0) {
      groups.push({ label: GROUP_LABELS[groupId], items });
    }
  }

  return groups;
}

/**
 * Full unfiltered admin nav groups.
 * Use buildVisibleAdminNavGroups for permission-filtered output.
 */
export const allAdminNavGroups: AdminNavGroup[] = buildAdminNavGroups(adminSections);
