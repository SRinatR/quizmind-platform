import { notFound } from 'next/navigation';
import Link from 'next/link';

import { SiteShell } from '../../components/site-shell';
import { publicPageContent, type PublicItemStatus } from '../../content/public-pages';

interface MarketingPageProps {
  params: Promise<{ slug: string }>;
}

function getStatusLabel(status: PublicItemStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'in_development':
      return 'In development';
    case 'planned':
      return 'Planned';
    default:
      return 'Unknown';
  }
}

export default async function MarketingPage({ params }: MarketingPageProps) {
  const { slug } = await params;
  const page = publicPageContent[slug as keyof typeof publicPageContent];

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
      <section className="panel">
        <span className="micro-label">Modules</span>
        <h2>Current status</h2>
        <div className="list-stack">
          {page.items.map((item) => (
            <div className="list-item" key={`${item.title}:${item.status}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{item.title}</h3>
                <span className="status-pill">{getStatusLabel(item.status)}</span>
              </div>
              <p>{item.summary}</p>
              {item.updatedAt ? <p className="micro-label">Updated: {item.updatedAt}</p> : null}
              {item.href ? <Link href={item.href}>Open related page</Link> : null}
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
