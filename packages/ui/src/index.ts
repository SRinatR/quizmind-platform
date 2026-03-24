export interface NavigationItem {
  label: string;
  href: string;
  requiresAuth?: boolean;
  adminOnly?: boolean;
}

export const publicNavigation: NavigationItem[] = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Login', href: '/auth/login' },
];

export const dashboardNavigation: NavigationItem[] = [
  { label: 'Overview', href: '/app', requiresAuth: true },
  { label: 'Billing', href: '/app/billing', requiresAuth: true },
  { label: 'Usage', href: '/app/usage', requiresAuth: true },
  { label: 'Installations', href: '/app/installations', requiresAuth: true },
  { label: 'Settings', href: '/app/settings', requiresAuth: true },
];

export const adminNavigation: NavigationItem[] = [
  { label: 'Users', href: '/admin/users', requiresAuth: true, adminOnly: true },
  { label: 'Support', href: '/admin/support', requiresAuth: true, adminOnly: true },
  { label: 'Plans', href: '/admin/plans', requiresAuth: true, adminOnly: true },
  { label: 'Flags', href: '/admin/feature-flags', requiresAuth: true, adminOnly: true },
  { label: 'Extension', href: '/admin/extension-control', requiresAuth: true, adminOnly: true },
  { label: 'Remote Config', href: '/admin/remote-config', requiresAuth: true, adminOnly: true },
];
