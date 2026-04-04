export interface NavigationItem {
  label: string;
  href: string;
  requiresAuth?: boolean;
  adminOnly?: boolean;
}

export const publicNavigation: NavigationItem[] = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Docs', href: '/docs' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Roadmap', href: '/roadmap' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Login', href: '/auth/login' },
];

export const dashboardNavigation: NavigationItem[] = [
  { label: 'Your Profile', href: '/app', requiresAuth: true },
  { label: 'Usage', href: '/app/usage', requiresAuth: true },
  { label: 'History', href: '/app/history', requiresAuth: true },
  { label: 'Installations', href: '/app/installations', requiresAuth: true },
  { label: 'Settings', href: '/app/settings', requiresAuth: true },
];

export const adminNavigation: NavigationItem[] = [
  { label: 'Users', href: '/admin/users', requiresAuth: true, adminOnly: true },
  { label: 'Logs', href: '/admin/logs', requiresAuth: true, adminOnly: true },
  { label: 'Security', href: '/admin/security', requiresAuth: true, adminOnly: true },
  { label: 'Webhooks', href: '/admin/webhooks', requiresAuth: true, adminOnly: true },
  { label: 'Support', href: '/admin/support', requiresAuth: true, adminOnly: true },
  { label: 'Plans', href: '/admin/plans', requiresAuth: true, adminOnly: true },
  { label: 'AI Providers', href: '/admin/ai-providers', requiresAuth: true, adminOnly: true },
  { label: 'Usage', href: '/admin/usage', requiresAuth: true, adminOnly: true },
  { label: 'Extension Fleet', href: '/admin/extension-fleet', requiresAuth: true, adminOnly: true },
  { label: 'Flags', href: '/admin/feature-flags', requiresAuth: true, adminOnly: true },
  { label: 'Compatibility', href: '/admin/compatibility', requiresAuth: true, adminOnly: true },
  { label: 'Extension', href: '/admin/extension-control', requiresAuth: true, adminOnly: true },
  { label: 'Remote Config', href: '/admin/remote-config', requiresAuth: true, adminOnly: true },
];
