export type PublicPageSlug =
  | 'faq'
  | 'features'
  | 'blog'
  | 'docs'
  | 'changelog'
  | 'roadmap';

export type PublicItemStatus = 'live' | 'in_development' | 'planned';

export interface PublicPageItem {
  title: string;
  summary: string;
  status: PublicItemStatus;
  href?: string;
  updatedAt?: string;
}

export interface PublicPageContent {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  items: PublicPageItem[];
}

export const publicPageContent: Record<PublicPageSlug, PublicPageContent> = {
  faq: {
    eyebrow: 'FAQ',
    title: 'Common foundation questions',
    description:
      'Short answers about why the platform is split into web, api, worker, and shared domain packages.',
    bullets: [
      'The web app serves both customer and admin experiences.',
      'The API owns auth, billing, compatibility, remote config, and support primitives.',
      'The worker isolates queue-driven side effects and scheduled jobs.',
    ],
    items: [
      {
        title: 'Architecture FAQ',
        summary: 'Source-of-truth responsibilities and domain boundaries for each service.',
        status: 'live',
        href: '/docs',
      },
      {
        title: 'Extension Integration FAQ',
        summary: 'How bind/bootstrap/session flows work for the managed extension client.',
        status: 'live',
        href: '/docs',
      },
    ],
  },
  features: {
    eyebrow: 'Features',
    title: 'Control-plane capabilities from day one',
    description:
      'Auth, entitlements, compatibility policy, remote config, and logging are all part of the base scaffold.',
    bullets: [
      'RBAC + ABAC aware route visibility.',
      'Quota and usage limit resolution.',
      'Support impersonation with audit and security logs.',
    ],
    items: [
      {
        title: 'AI Proxy',
        summary: 'Managed provider routing with BYOK policy controls and server-side quota checks.',
        status: 'live',
      },
      {
        title: 'Wallet & Top-Up',
        summary: 'YooKassa-backed wallet balance, top-up history, and payment confirmation flow.',
        status: 'in_development',
        href: '/roadmap',
      },
      {
        title: 'Remote Config + Feature Flags',
        summary: 'Versioned config and rollout controls exposed in admin and extension bootstrap.',
        status: 'live',
      },
    ],
  },
  blog: {
    eyebrow: 'Blog',
    title: 'Product and engineering notes',
    description: 'Release narratives, implementation writeups, and operational lessons from the platform rollout.',
    bullets: [
      'Every operational release is mirrored in changelog entries.',
      'Architecture notes explain why key control-plane decisions were made.',
      'Posts are written for extension developers, admins, and operators.',
    ],
    items: [
      {
        title: 'Launch Notes v1',
        summary: 'Foundational release summary for auth, billing, support workflows, and extension bootstrap.',
        status: 'in_development',
        href: '/changelog',
        updatedAt: '2026-03-27',
      },
      {
        title: 'AI Proxy Deep Dive',
        summary: 'How server-side provider routing, BYOK policy, and quota enforcement are implemented.',
        status: 'planned',
        href: '/roadmap',
      },
      {
        title: 'Support Ops Playbook',
        summary: 'Practical workflows for impersonation safety rails and ticket handoff discipline.',
        status: 'planned',
        href: '/roadmap',
      },
    ],
  },
  docs: {
    eyebrow: 'Docs',
    title: 'Implementation guides and contracts',
    description: 'Guides for integrating the extension, operating the control plane, and handling production events.',
    bullets: [
      'Auth and installation sessions are the primary integration path.',
      'All critical runtime checks are server-enforced, not client-enforced.',
      'Operational procedures are documented before production rollout.',
    ],
    items: [
      {
        title: 'Extension Developer Handoff',
        summary: 'Bind/bootstrap/auth/session lifecycle and telemetry ingestion requirements.',
        status: 'live',
        href: '/changelog',
        updatedAt: '2026-03-25',
      },
      {
        title: 'Wallet Runbook',
        summary: 'Top-up flow, webhook handling, and wallet balance operations guidance.',
        status: 'in_development',
        href: '/roadmap',
      },
      {
        title: 'Security Baseline',
        summary: 'Secrets handling, audit trails, and privileged action controls.',
        status: 'in_development',
        href: '/roadmap',
      },
    ],
  },
  changelog: {
    eyebrow: 'Changelog',
    title: 'Shipping timeline',
    description: 'Chronological release feed for platform functionality, contracts, and operational safeguards.',
    bullets: [
      'Entries track real system changes, not roadmap ideas.',
      'Every release includes affected domains and follow-up actions.',
      'In-progress work is linked to roadmap tracks for visibility.',
    ],
    items: [
      {
        title: '2026-03-27: AI proxy foundation',
        summary: 'Added /ai/proxy endpoint, policy checks, BYOK routing, and quota-aware usage logging.',
        status: 'live',
        updatedAt: '2026-03-27',
      },
      {
        title: '2026-03-27: Billing provider expansion',
        summary: 'Extended provider model with YooKassa/Paddle foundations and additional webhook support.',
        status: 'live',
        updatedAt: '2026-03-27',
      },
      {
        title: 'Next: Public docs/blog expansion',
        summary: 'Structured content surfaces for docs, blog, and roadmap transparency.',
        status: 'in_development',
        href: '/roadmap',
      },
    ],
  },
  roadmap: {
    eyebrow: 'Roadmap',
    title: 'Execution tracks',
    description: 'Operational sequence for delivering the full platform scope without deleting unfinished modules.',
    bullets: [
      'Foundation and core backend domains are already in active delivery.',
      'Unfinished sections stay visible as stubs/read-only/coming-soon states.',
      'Launch readiness includes rollback paths, alerts, and support playbooks.',
    ],
    items: [
      {
        title: 'Track A: Foundation hardening',
        summary: 'Monorepo integrity, contracts, connected runtime, and shared UI shell stability.',
        status: 'live',
      },
      {
        title: 'Track B: Multi-provider billing',
        summary: 'Stripe live flow plus YooKassa and Paddle adapter completion.',
        status: 'in_development',
        href: '/changelog',
      },
      {
        title: 'Track C: Public content system',
        summary: 'Blog/docs/changelog pages with release narratives and integration guides.',
        status: 'in_development',
        href: '/changelog',
      },
      {
        title: 'Track D: Production readiness',
        summary: 'Alerting, health checks, retry tooling, security hardening, and launch runbooks.',
        status: 'planned',
      },
    ],
  },
};
