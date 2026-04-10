export interface NavigationItem {
  label: string;
  href: string;
  requiresAuth?: boolean;
  adminOnly?: boolean;
}

export interface AdminNavGroup {
  label: string;
  items: NavigationItem[];
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

export const adminNavigationGroups: AdminNavGroup[] = [
  {
    label: 'People',
    items: [
      { label: 'Users', href: '/admin/users', requiresAuth: true, adminOnly: true },
      { label: 'Support', href: '/admin/support', requiresAuth: true, adminOnly: true },
      { label: 'Access Sessions', href: '/admin/access-sessions', requiresAuth: true, adminOnly: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Events', href: '/admin/events', requiresAuth: true, adminOnly: true },
      { label: 'Security', href: '/admin/security', requiresAuth: true, adminOnly: true },
      { label: 'Jobs & Webhooks', href: '/admin/webhooks', requiresAuth: true, adminOnly: true },
    ],
  },
  {
    label: 'Extensions',
    items: [
      { label: 'Fleet', href: '/admin/extension-fleet', requiresAuth: true, adminOnly: true },
      { label: 'Usage', href: '/admin/usage', requiresAuth: true, adminOnly: true },
      { label: 'Compatibility', href: '/admin/compatibility', requiresAuth: true, adminOnly: true },
      { label: 'Bootstrap Simulator', href: '/admin/bootstrap-simulator', requiresAuth: true, adminOnly: true },
    ],
  },
  {
    label: 'Control Plane',
    items: [
      { label: 'Feature Flags', href: '/admin/feature-flags', requiresAuth: true, adminOnly: true },
      { label: 'Remote Config', href: '/admin/remote-config', requiresAuth: true, adminOnly: true },
      { label: 'AI Routing', href: '/admin/ai-routing', requiresAuth: true, adminOnly: true },
    ],
  },
];

// Flat list for backward-compat consumers
export const adminNavigation: NavigationItem[] = adminNavigationGroups.flatMap((g) => g.items);
