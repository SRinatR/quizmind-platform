import { type AccessRequirement } from '@quizmind/contracts';
import { type AdminNavGroup, type NavigationItem } from '@quizmind/ui';

export type AdminSectionGroup = 'people' | 'operations' | 'control-plane' | 'preferences';

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
  // ── Operations ───────────────────────────────────────────────────────
  {
    id: 'logs',
    title: 'Logs',
    navLabel: 'Logs',
    href: '/admin/logs',
    description: 'Unified platform log center: auth, extension, AI, admin, and system events.',
    requirement: { permission: 'audit_logs:read' },
    group: 'operations',
    groupLabel: 'Operations',
  },
  // ── Control Plane ────────────────────────────────────────────────────
  {
    id: 'extension-control',
    title: 'Extension Control',
    navLabel: 'Extension Control',
    href: '/admin/extension-control',
    description: 'Client version policy, runtime feature settings, and config rollouts.',
    requirement: { permission: 'remote_config:read' },
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

  {
    id: 'pricing-billing',
    title: 'Pricing & Billing',
    navLabel: 'Pricing & Billing',
    href: '/admin/pricing-billing',
    description: 'AI request pricing, commission, and charging behavior.',
    requirement: { requireSystemRole: 'admin' },
    group: 'control-plane',
    groupLabel: 'Control Plane',
  },

  {
    id: 'data-retention',
    title: 'Data Retention',
    navLabel: 'Data Retention',
    href: '/admin/data-retention',
    description: 'Platform-wide retention controls for AI history, logs, and auth/session records.',
    requirement: { requireSystemRole: 'admin' },
    group: 'control-plane',
    groupLabel: 'Control Plane',
  },

  {
    id: 'settings',
    title: 'Settings',
    navLabel: 'Settings',
    href: '/admin/settings',
    description: 'Appearance preferences for your admin workspace.',
    requirement: { requireSystemRole: 'admin' },
    group: 'preferences',
    groupLabel: 'Preferences',
  },
];

// ── Group order and labels ────────────────────────────────────────────────────

const GROUP_ORDER: AdminSectionGroup[] = ['people', 'operations', 'control-plane', 'preferences'];

const GROUP_LABELS: Record<AdminSectionGroup, string> = {
  people: 'People',
  operations: 'Operations',
  'control-plane': 'Control Plane',
  preferences: 'Preferences',
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
