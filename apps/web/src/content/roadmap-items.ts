export type RoadmapStatus = 'planned' | 'in_progress' | 'completed';

export interface RoadmapLink {
  label: string;
  href: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  status: RoadmapStatus;
  targetWindow: string;
  owner: string;
  summary: string;
  streams: string[];
  links?: RoadmapLink[];
}

export const roadmapStatusOrder: RoadmapStatus[] = ['in_progress', 'planned', 'completed'];

export const roadmapItems: RoadmapItem[] = [
  {
    id: 'track-public-content',
    title: 'Public content system: blog, docs, changelog, roadmap',
    status: 'in_progress',
    targetWindow: 'Sprint 3',
    owner: 'web',
    summary:
      'Ship structured public content pages and keep release communication synchronized with control-plane milestones.',
    streams: ['web', 'content', 'docs'],
    links: [
      {
        label: 'Changelog',
        href: '/changelog',
      },
      {
        label: 'Roadmap',
        href: '/roadmap',
      },
    ],
  },
  {
    id: 'track-dashboard-mvp',
    title: 'Dashboard MVP completion',
    status: 'in_progress',
    targetWindow: 'Sprint 2',
    owner: 'web + api',
    summary:
      'Finalize usage history, billing controls, settings profile management, and workspace-scoped installation visibility.',
    streams: ['dashboard', 'billing', 'usage'],
    links: [
      {
        label: 'Dashboard',
        href: '/app',
      },
      {
        label: 'History',
        href: '/app/history',
      },
    ],
  },
  {
    id: 'track-multi-provider-billing',
    title: 'Multi-provider billing expansion',
    status: 'planned',
    targetWindow: 'Sprint 2-3',
    owner: 'billing',
    summary:
      'Extend checkout, webhook, and lifecycle handling with YooKassa parity while keeping Stripe as the stable baseline.',
    streams: ['billing', 'webhooks', 'subscriptions'],
    links: [
      {
        label: 'Plans',
        href: '/admin/plans',
      },
      {
        label: 'Webhook jobs',
        href: '/admin/webhooks',
      },
    ],
  },
  {
    id: 'track-ai-proxy-hardening',
    title: 'AI proxy operational hardening',
    status: 'planned',
    targetWindow: 'Sprint 4',
    owner: 'api + ops',
    summary:
      'Add deeper monitoring, alerting, and controlled failover behavior for provider policy, quota gates, and streaming proxy calls.',
    streams: ['ai', 'monitoring', 'security'],
    links: [
      {
        label: 'AI providers',
        href: '/admin/ai-providers',
      },
      {
        label: 'Usage explorer',
        href: '/admin/usage',
      },
    ],
  },
  {
    id: 'track-extension-link',
    title: 'Site-platform-extension connection runbook execution',
    status: 'completed',
    targetWindow: 'Sprint 1-2',
    owner: 'platform',
    summary:
      'Delivered cookie-backed bridge, installation bind, bootstrap v2 support, reconnect controls, and fleet diagnostics coverage.',
    streams: ['extension', 'platform', 'security'],
    links: [
      {
        label: 'Installations',
        href: '/app/installations',
      },
      {
        label: 'Extension fleet',
        href: '/admin/extension-fleet',
      },
    ],
  },
  {
    id: 'track-auth-foundation',
    title: 'Connected auth and session lifecycle',
    status: 'completed',
    targetWindow: 'Sprint 1',
    owner: 'api',
    summary:
      'Shipped register/login/verify/reset flows, session rotation, and profile/session endpoints for connected runtime.',
    streams: ['auth', 'security', 'email'],
    links: [
      {
        label: 'Login',
        href: '/auth/login',
      },
      {
        label: 'Settings',
        href: '/app/settings',
      },
    ],
  },
];

