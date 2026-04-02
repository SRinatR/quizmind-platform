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
    description: 'Account summary, usage overview, and extension status.',
  },
  {
    id: 'billing',
    title: 'Wallet',
    href: '/app/billing',
    description: 'Wallet balance, top-up history, and payment.',
  },
  {
    id: 'usage',
    title: 'Usage',
    href: '/app/usage',
    description: 'Quota usage, extension telemetry, and recent events.',
  },
  {
    id: 'history',
    title: 'History',
    href: '/app/history',
    description: 'Filter telemetry and activity history with event drilldowns.',
  },
  {
    id: 'installations',
    title: 'Installations',
    href: '/app/installations',
    description: 'Connected extension installations, compatibility state, and reconnect controls.',
  },
  {
    id: 'settings',
    title: 'Settings',
    href: '/app/settings',
    description: 'Account security, active sessions, and personal settings.',
  },
];
