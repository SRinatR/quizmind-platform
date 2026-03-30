export interface DocsGuideSection {
  heading: string;
  paragraphs: string[];
}

export interface DocsGuide {
  slug: string;
  title: string;
  summary: string;
  updatedAt: string;
  audience: string;
  tags: string[];
  prerequisites: string[];
  steps: string[];
  sections: DocsGuideSection[];
  links?: Array<{
    label: string;
    href: string;
  }>;
}

export const docsGuides: DocsGuide[] = [
  {
    slug: 'site-platform-extension-connection',
    title: 'Site, Platform, and Extension Connection Guide',
    summary:
      'Operational sequence for connecting signed-in web sessions, extension installation bind, bootstrap v2, and usage telemetry.',
    updatedAt: '2026-03-27T10:20:00.000Z',
    audience: 'Extension developers and platform integrators',
    tags: ['extension', 'auth', 'bootstrap'],
    prerequisites: [
      'Connected runtime with API, worker, PostgreSQL, and Redis available.',
      'Authenticated web session through /auth/login.',
      'Extension runtime able to persist installationId locally.',
    ],
    steps: [
      'Open bridge route with installation handshake plus targetOrigin and bridgeNonce.',
      'Proxy bind through the site session and issue installation token.',
      'Store installation token and call /extension/bootstrap/v2.',
      'Send usage events to /extension/usage-events/v2.',
      'Trigger reconnect flow when installation session expires or is revoked.',
    ],
    sections: [
      {
        heading: 'Design rule',
        paragraphs: [
          'The platform is source of truth, the web app is the control surface, and the extension is a managed client.',
          'The extension should never receive raw user access tokens as steady-state credentials.',
        ],
      },
      {
        heading: 'Failure fallback',
        paragraphs: [
          'If postMessage handoff fails, the bridge can issue a one-time redeem code with TTL constraints and nonce/request checks.',
          'This fallback keeps installation binding recoverable without weakening the main origin-restricted delivery path.',
        ],
      },
    ],
    links: [
      {
        label: 'Bridge route',
        href: '/app/extension/connect',
      },
      {
        label: 'Installations dashboard',
        href: '/app/installations',
      },
    ],
  },
  {
    slug: 'ai-proxy-governance-and-byok',
    title: 'AI Proxy Governance and BYOK Policy',
    summary:
      'How model access, provider policy, platform keys, and user-managed credentials interact in connected runtime.',
    updatedAt: '2026-03-27T09:40:00.000Z',
    audience: 'Platform operators and backend developers',
    tags: ['ai-proxy', 'byok', 'policy'],
    prerequisites: [
      'Connected API runtime with provider credential secret configured.',
      'Workspace principal with relevant credentials and provider permissions.',
    ],
    steps: [
      'Resolve workspace policy for providers, mode, and model-tag constraints.',
      'Validate request body including model, messages, and stream options.',
      'Route via platform key or decrypted BYOK credential depending on policy.',
      'Enforce quota checks for platform-managed requests.',
      'Persist usage completion metadata and quota snapshots.',
    ],
    sections: [
      {
        heading: 'Routing guarantees',
        paragraphs: [
          'Provider secrets are encrypted at rest and never returned to clients.',
          'Policy scope can be global or workspace-specific, with workspace overrides inheriting from global defaults when unset.',
        ],
      },
      {
        heading: 'Operational observability',
        paragraphs: [
          'Completion metadata is logged for activity, security, and domain streams, so operators can investigate request behavior without reading raw prompt payloads.',
          'Usage snapshots are used by dashboard and admin surfaces for quota and billing diagnostics.',
        ],
      },
    ],
    links: [
      {
        label: 'AI providers admin',
        href: '/admin/ai-providers',
      },
      {
        label: 'Usage explorer',
        href: '/admin/usage',
      },
    ],
  },
  {
    slug: 'support-operations-workflow',
    title: 'Support Operations Workflow',
    summary:
      'Support ticket handling, impersonation safety rails, and handoff logging with audit/security streams.',
    updatedAt: '2026-03-26T16:15:00.000Z',
    audience: 'Support operators and security reviewers',
    tags: ['support', 'impersonation', 'audit'],
    prerequisites: [
      'Principal with support impersonation permission.',
      'Visibility into target workspace and support ticket context.',
    ],
    steps: [
      'Filter support queue by ownership, status, and search scope.',
      'Open or update ticket workflow with ownership and handoff notes.',
      'Start impersonation with explicit reason and optional ticket binding.',
      'End impersonation and record close reason for audit history.',
    ],
    sections: [
      {
        heading: 'Safety model',
        paragraphs: [
          'Impersonation is explicitly scoped and logged with actor, target user, and workspace references.',
          'Termination is idempotent and always writes audit + security events for traceability.',
        ],
      },
      {
        heading: 'Queue hygiene',
        paragraphs: [
          'Preset favorites and timeline depth controls help operators focus on active queues without losing handoff context.',
          'Support data remains reviewable in admin surfaces for post-incident analysis.',
        ],
      },
    ],
    links: [
      {
        label: 'Support queue',
        href: '/admin/support',
      },
      {
        label: 'Audit logs',
        href: '/admin/logs',
      },
    ],
  },
];

