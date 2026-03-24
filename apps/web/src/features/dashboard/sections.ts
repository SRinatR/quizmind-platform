import { type AccessRequirement } from '@quizmind/contracts';

export interface DashboardSection {
  id: string;
  title: string;
  href: string;
  description: string;
  requirement?: AccessRequirement;
}

export const dashboardSections: DashboardSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    href: '/app',
    description: 'Workspace summary, current plan, and extension status.',
    requirement: {
      permission: 'workspaces:read',
    },
  },
  {
    id: 'billing',
    title: 'Billing',
    href: '/app/billing',
    description: 'Plan, invoices, entitlements, and renewal state.',
    requirement: {
      permission: 'subscriptions:read',
    },
  },
  {
    id: 'usage',
    title: 'Usage',
    href: '/app/usage',
    description: 'Quota usage, extension telemetry, and recent events.',
    requirement: {
      permission: 'workspaces:read',
    },
  },
  {
    id: 'settings',
    title: 'Settings',
    href: '/app/settings',
    description: 'Account security, active sessions, and workspace defaults.',
    requirement: {
      permission: 'workspaces:read',
    },
  },
];
