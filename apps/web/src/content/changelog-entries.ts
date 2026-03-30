export type ChangelogEntryType = 'feature' | 'improvement' | 'fix' | 'operations';

export interface ChangelogLink {
  label: string;
  href: string;
}

export interface ChangelogEntry {
  id: string;
  version: string;
  publishedAt: string;
  type: ChangelogEntryType;
  title: string;
  summary: string;
  domains: string[];
  links?: ChangelogLink[];
  followUps?: string[];
}

export const changelogEntries: ChangelogEntry[] = [
  {
    id: '2026-03-27-profile-settings-connected',
    version: 'v1.3.8',
    publishedAt: '2026-03-27T11:30:00.000Z',
    type: 'feature',
    title: 'Connected profile editing in dashboard settings',
    summary:
      'Settings now load and persist user profile fields through connected /user/profile GET/PATCH flows with cookie-backed auth.',
    domains: ['web', 'api', 'contracts'],
    links: [
      {
        label: 'Open settings',
        href: '/app/settings',
      },
    ],
  },
  {
    id: '2026-03-27-usage-history-timeline',
    version: 'v1.3.7',
    publishedAt: '2026-03-27T09:10:00.000Z',
    type: 'feature',
    title: 'Workspace usage history timeline and CSV export',
    summary:
      'Added filterable /app/history with telemetry + activity merge, workspace scoping, source filters, and CSV export gating.',
    domains: ['web', 'usage', 'admin'],
    links: [
      {
        label: 'Open history',
        href: '/app/history',
      },
      {
        label: 'Open usage',
        href: '/app/usage',
      },
    ],
  },
  {
    id: '2026-03-27-ai-proxy-streaming',
    version: 'v1.3.6',
    publishedAt: '2026-03-27T07:50:00.000Z',
    type: 'improvement',
    title: 'AI proxy streaming path with completion persistence',
    summary:
      'AI proxy now supports stream=true SSE responses while still recording post-stream usage and quota metadata after completion.',
    domains: ['api', 'ai', 'providers'],
    links: [
      {
        label: 'Provider policy',
        href: '/admin/ai-providers',
      },
      {
        label: 'Compatibility',
        href: '/admin/compatibility',
      },
    ],
    followUps: [
      'Track streaming latency percentile metrics in the operations dashboard.',
      'Add provider-level fallback routing for transient upstream failures.',
    ],
  },
  {
    id: '2026-03-26-extension-bridge-fallback',
    version: 'v1.3.5',
    publishedAt: '2026-03-26T18:20:00.000Z',
    type: 'operations',
    title: 'Extension bind bridge nonce/origin hardening plus one-time fallback code',
    summary:
      'Bridge flow now validates target origin + nonce and can issue short-lived redeem-once bind codes when postMessage handoff fails.',
    domains: ['web', 'extension', 'security'],
    links: [
      {
        label: 'Extension connect',
        href: '/app/extension/connect',
      },
      {
        label: 'Installations',
        href: '/app/installations',
      },
    ],
  },
  {
    id: '2026-03-25-billing-webhook-ops',
    version: 'v1.3.4',
    publishedAt: '2026-03-25T15:45:00.000Z',
    type: 'fix',
    title: 'Webhook retry controls and queue visibility for billing operations',
    summary:
      'Added admin-level webhook retry endpoint integration and improved queue visibility for diagnosing Stripe/YooKassa delivery failures.',
    domains: ['billing', 'worker', 'admin'],
    links: [
      {
        label: 'Webhook operations',
        href: '/admin/webhooks',
      },
    ],
  },
];

