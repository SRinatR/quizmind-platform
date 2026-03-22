import { notFound } from 'next/navigation';

import { SiteShell } from '../../components/site-shell';

const marketingContent = {
  faq: {
    eyebrow: 'FAQ',
    title: 'Common foundation questions',
    description: 'Short answers about why the platform was split into web, api, worker, and shared domain packages.',
    bullets: [
      'The web app serves both customer and admin experiences.',
      'The API owns auth, billing, compatibility, remote config, and support primitives.',
      'The worker isolates queue-driven side effects and scheduled jobs.',
    ],
  },
  features: {
    eyebrow: 'Features',
    title: 'Control-plane capabilities from day one',
    description: 'Auth, entitlements, compatibility policy, remote config, and logging are all part of the base scaffold.',
    bullets: [
      'RBAC + ABAC aware route visibility.',
      'Subscription and entitlement resolution.',
      'Support impersonation with audit and security logs.',
    ],
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Plans designed around entitlements',
    description: 'The billing engine already models free and pro plans, limit-based entitlements, and override hooks.',
    bullets: [
      'Plan definition drives access and usage limits.',
      'Overrides let support or sales unlock temporary capabilities.',
      'The same plan data feeds web UI and API responses.',
    ],
  },
} as const;

interface MarketingPageProps {
  params: Promise<{ slug: string }>;
}

export default async function MarketingPage({ params }: MarketingPageProps) {
  const { slug } = await params;
  const page = marketingContent[slug as keyof typeof marketingContent];

  if (!page) {
    notFound();
  }

  return (
    <SiteShell
      apiState="Marketing route"
      currentPersona="platform-admin"
      description={page.description}
      eyebrow={page.eyebrow}
      pathname={`/${slug}`}
      title={page.title}
    >
      <section className="panel">
        <span className="micro-label">Highlights</span>
        <h2>{page.title}</h2>
        <div className="list-stack">
          {page.bullets.map((bullet) => (
            <div className="list-item" key={bullet}>
              <p>{bullet}</p>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
