import { type SystemRole } from '@quizmind/contracts';

export interface DemoAccount {
  label: string;
  email: string;
  password: string;
  systemRoles: SystemRole[];
  highlights: string[];
}

export const demoAccounts: DemoAccount[] = [
  {
    label: 'Admin',
    email: 'admin@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['super_admin'],
    highlights: ['Full admin platform: users, support, events, fleet, control plane'],
  },
  {
    label: 'User',
    email: 'owner@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    highlights: ['Dashboard, billing, usage, history, installations, settings'],
  },
];
