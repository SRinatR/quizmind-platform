// ── Navigation item types ─────────────────────────────────────────────────────
// Admin section metadata and grouped navigation are the single source of truth
// maintained in apps/web/src/features/admin/sections.ts.
// Only the shared NavigationItem / AdminNavGroup interfaces live here so that
// both app code and the sections registry can reference them without a
// circular-package dependency.

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

// ── Public marketing navigation ───────────────────────────────────────────────

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

// ── Dashboard navigation ──────────────────────────────────────────────────────

export const dashboardNavigation: NavigationItem[] = [
  { label: 'Your Profile', href: '/app', requiresAuth: true },
  { label: 'Usage', href: '/app/usage', requiresAuth: true },
  { label: 'History', href: '/app/history', requiresAuth: true },
  { label: 'Installations', href: '/app/installations', requiresAuth: true },
  { label: 'Settings', href: '/app/settings', requiresAuth: true },
];
