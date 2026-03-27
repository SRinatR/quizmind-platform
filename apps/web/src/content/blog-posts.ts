export interface BlogPostSection {
  heading: string;
  paragraphs: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  author: string;
  category: string;
  tags: string[];
  readingMinutes: number;
  highlights: string[];
  sections: BlogPostSection[];
  links?: Array<{
    label: string;
    href: string;
  }>;
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'extension-bridge-security-hardening',
    title: 'Extension Bridge Security Hardening: nonce, origin, and fallback code',
    excerpt:
      'How the web-to-extension bind bridge moved from permissive postMessage to strict origin + nonce validation with one-time fallback redemption.',
    publishedAt: '2026-03-27T10:45:00.000Z',
    author: 'QuizMind Platform Team',
    category: 'Security',
    tags: ['extension', 'security', 'platform'],
    readingMinutes: 6,
    highlights: [
      'Bridge handoff now requires strict target origin matching.',
      'Nonce echoing is mandatory for result and error envelopes.',
      'One-time redeem flow is available when opener messaging fails.',
    ],
    sections: [
      {
        heading: 'Why this changed',
        paragraphs: [
          'The extension bind bridge is the most sensitive public entrypoint because it converts a signed-in site session into installation-level credentials.',
          'Any relaxed postMessage behavior increases risk, so we tightened transport checks before adding more extension-side automation.',
        ],
      },
      {
        heading: 'What is enforced now',
        paragraphs: [
          'The bridge validates target origin and rejects wildcard delivery.',
          'Nonce correlation is applied to success and error payloads so the extension can verify envelope authenticity before persisting installation state.',
          'A short-lived one-time fallback code can be redeemed once when direct postMessage handoff cannot complete.',
        ],
      },
      {
        heading: 'Operational impact',
        paragraphs: [
          'Support teams can diagnose failed bridge handoffs by comparing requestId, nonce, and fallback redemption outcomes in logs.',
          'The extension continues using installation tokens only; raw user bearer tokens are never passed into runtime extension state.',
        ],
      },
    ],
    links: [
      {
        label: 'Open extension connect route',
        href: '/app/extension/connect',
      },
      {
        label: 'Read installations inventory',
        href: '/app/installations',
      },
    ],
  },
  {
    slug: 'usage-history-dashboard-rollout',
    title: 'Usage History Dashboard Rollout',
    excerpt:
      'A dedicated history timeline now merges telemetry and activity streams with source-aware filters and CSV export controls.',
    publishedAt: '2026-03-27T08:50:00.000Z',
    author: 'QuizMind Platform Team',
    category: 'Dashboard',
    tags: ['dashboard', 'usage', 'telemetry'],
    readingMinutes: 5,
    highlights: [
      'History now supports workspace, source, event type, installation, and actor filters.',
      'CSV export is permission-gated (`usage:export`).',
      'Pagination keeps timeline reads efficient for operators.',
    ],
    sections: [
      {
        heading: 'Scope delivered',
        paragraphs: [
          'The dashboard gained a dedicated /app/history surface with unified telemetry and activity visualization.',
          'Operators can now inspect installation and actor context in one timeline instead of switching between admin and usage views.',
        ],
      },
      {
        heading: 'Control-plane alignment',
        paragraphs: [
          'The page consumes the same backend usage history contract used for API-level exports and admin workflows.',
          'Permissions and workspace checks are still resolved server-side; UI filters only shape query scope.',
        ],
      },
    ],
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
    slug: 'ai-proxy-streaming-completion-logging',
    title: 'AI Proxy Streaming Completion Logging',
    excerpt:
      'Streaming responses now preserve quota and usage accounting by recording completion metadata after SSE stream closure.',
    publishedAt: '2026-03-27T07:35:00.000Z',
    author: 'QuizMind Platform Team',
    category: 'AI Proxy',
    tags: ['ai-proxy', 'streaming', 'quota'],
    readingMinutes: 7,
    highlights: [
      'stream=true requests are now first-class in the proxy controller.',
      'Usage extraction from SSE events updates quota snapshots consistently.',
      'Completion persistence still runs even when streams close on the client side.',
    ],
    sections: [
      {
        heading: 'Delivery details',
        paragraphs: [
          'The proxy controller now bridges readable web streams to the HTTP response pipeline with controlled abort handling.',
          'The service inspects SSE chunks for usage and response identifiers, then records completion metadata after stream consumption.',
        ],
      },
      {
        heading: 'Why this matters',
        paragraphs: [
          'Quota counters and usage reports stay accurate for streaming and non-streaming workloads.',
          'This keeps billing, abuse detection, and operator analytics aligned with actual runtime traffic.',
        ],
      },
    ],
    links: [
      {
        label: 'Open AI provider governance',
        href: '/admin/ai-providers',
      },
      {
        label: 'Open usage explorer',
        href: '/admin/usage',
      },
    ],
  },
];

