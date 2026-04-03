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
    label: 'Personal super admin',
    email: 'admin@quizmind.dev',
    password: 'demo-password',
    systemRoles: [
      'super_admin',
      'platform_admin',
      'billing_admin',
      'support_admin',
      'security_admin',
      'ops_admin',
      'content_admin',
    ],
    highlights: ['All admin routes, logs, support impersonation, publish controls'],
  },
  {
    label: 'Platform admin',
    email: 'platform@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['platform_admin'],
    highlights: ['General admin operations and control-plane routes'],
  },
  {
    label: 'Support admin',
    email: 'support@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['support_admin'],
    highlights: ['Support queue, impersonation sessions, user investigation'],
  },
  {
    label: 'Billing admin',
    email: 'billing@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['billing_admin'],
    highlights: ['Wallet, top-up history, usage budgeting'],
  },
  {
    label: 'Security admin',
    email: 'security@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['security_admin'],
    highlights: ['Security logs and audit export workflows'],
  },
  {
    label: 'Ops admin',
    email: 'ops@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['ops_admin'],
    highlights: ['Jobs, webhooks, compatibility operations'],
  },
  {
    label: 'Content admin',
    email: 'content@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['content_admin'],
    highlights: ['Feature-flag read workflows'],
  },
  {
    label: 'Authenticated user',
    email: 'owner@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    highlights: ['Dashboard, billing, installation management'],
  },
  {
    label: 'Viewer',
    email: 'viewer@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    highlights: ['Lowest-privilege verification baseline'],
  },
];
