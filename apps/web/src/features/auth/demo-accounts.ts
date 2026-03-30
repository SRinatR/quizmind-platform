import { type SystemRole, type WorkspaceRole } from '@quizmind/contracts';

export interface DemoAccount {
  label: string;
  email: string;
  password: string;
  systemRoles: SystemRole[];
  workspaceRoles: WorkspaceRole[];
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
    workspaceRoles: ['workspace_owner'],
    highlights: ['All admin routes, logs, support impersonation, publish controls'],
  },
  {
    label: 'Platform admin',
    email: 'platform@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['platform_admin'],
    workspaceRoles: ['workspace_admin'],
    highlights: ['General admin operations and control-plane routes'],
  },
  {
    label: 'Support admin',
    email: 'support@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['support_admin'],
    workspaceRoles: ['workspace_viewer'],
    highlights: ['Support queue, impersonation sessions, user investigation'],
  },
  {
    label: 'Billing admin',
    email: 'billing@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['billing_admin'],
    workspaceRoles: ['workspace_billing_manager'],
    highlights: ['Wallet, top-up history, usage budgeting'],
  },
  {
    label: 'Security admin',
    email: 'security@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['security_admin'],
    workspaceRoles: ['workspace_security_manager'],
    highlights: ['Security logs and audit export workflows'],
  },
  {
    label: 'Ops admin',
    email: 'ops@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['ops_admin'],
    workspaceRoles: ['workspace_manager'],
    highlights: ['Jobs, webhooks, compatibility operations'],
  },
  {
    label: 'Content admin',
    email: 'content@quizmind.dev',
    password: 'demo-password',
    systemRoles: ['content_admin'],
    workspaceRoles: ['workspace_member'],
    highlights: ['Feature-flag read workflows'],
  },
  {
    label: 'Workspace owner',
    email: 'owner@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    workspaceRoles: ['workspace_owner'],
    highlights: ['Workspace dashboard, billing, installation management'],
  },
  {
    label: 'Workspace admin',
    email: 'workspace-admin@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    workspaceRoles: ['workspace_admin'],
    highlights: ['Workspace operations without system-admin privileges'],
  },
  {
    label: 'Billing manager',
    email: 'billing-manager@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    workspaceRoles: ['workspace_billing_manager'],
    highlights: ['Subscription and payment visibility'],
  },
  {
    label: 'Security manager',
    email: 'security-manager@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    workspaceRoles: ['workspace_security_manager'],
    highlights: ['Audit-log reads and installation oversight'],
  },
  {
    label: 'Workspace manager',
    email: 'manager@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    workspaceRoles: ['workspace_manager'],
    highlights: ['Operational workspace controls and usage visibility'],
  },
  {
    label: 'Workspace analyst',
    email: 'analyst@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    workspaceRoles: ['workspace_analyst'],
    highlights: ['Usage exports and log analysis'],
  },
  {
    label: 'Workspace member',
    email: 'member@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    workspaceRoles: ['workspace_member'],
    highlights: ['Core workspace read flows and credentials'],
  },
  {
    label: 'Workspace viewer',
    email: 'viewer@quizmind.dev',
    password: 'demo-password',
    systemRoles: [],
    workspaceRoles: ['workspace_viewer'],
    highlights: ['Lowest-privilege verification baseline'],
  },
];
