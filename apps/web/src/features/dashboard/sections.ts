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
    description: 'Workspace summary, usage overview, and extension status.',
    requirement: {
      permission: 'workspaces:read',
    },
  },
  {
    id: 'billing',
    title: 'Wallet',
    href: '/app/billing',
    description: 'Wallet balance, top-up history, and payment.',
    requirement: {
      permission: 'workspaces:read',
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
    id: 'history',
    title: 'History',
    href: '/app/history',
    description: 'Filter telemetry and activity history with workspace-aware event drilldowns.',
    requirement: {
      permission: 'usage:read',
    },
  },
  {
    id: 'installations',
    title: 'Installations',
    href: '/app/installations',
    description: 'Connected extension installations, compatibility state, and reconnect controls.',
    requirement: {
      permission: 'installations:read',
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
