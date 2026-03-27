import Link from 'next/link';

import { SiteShell } from '../../components/site-shell';
import { docsGuides } from '../../content/docs-guides';

function formatDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export default function DocsPage() {
  const latestUpdate = docsGuides[0];
  const uniqueTags = Array.from(new Set(docsGuides.flatMap((guide) => guide.tags)));
  const totalSteps = docsGuides.reduce((sum, guide) => sum + guide.steps.length, 0);

  return (
    <SiteShell
      apiState="Public docs"
      currentPersona="platform-admin"
      description="Integration and operations guides for extension runtime, AI proxy, support workflows, and control-plane ownership."
      eyebrow="Docs"
      pathname="/docs"
      showPersonaSwitcher={false}
      title="Implementation and operations guides"
    >
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">Guides</span>
          <p className="stat-value">{docsGuides.length}</p>
          <p className="metric-copy">published docs pages</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Latest update</span>
          <p className="stat-value">{latestUpdate ? 'Current' : 'N/A'}</p>
          <p className="metric-copy">{latestUpdate ? formatDate(latestUpdate.updatedAt) : 'No docs yet'}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Topics</span>
          <p className="stat-value">{uniqueTags.length}</p>
          <p className="metric-copy">{uniqueTags.slice(0, 4).join(', ')}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Runbook steps</span>
          <p className="stat-value">{totalSteps}</p>
          <p className="metric-copy">across all guides</p>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Guides</span>
        <h2>Choose an implementation path</h2>
        <div className="content-library">
          {docsGuides.map((guide) => (
            <article className="content-card" key={guide.slug}>
              <div className="content-meta">
                <span className="status-pill">{guide.audience}</span>
                <span className="list-muted">{formatDate(guide.updatedAt)}</span>
              </div>
              <h3>{guide.title}</h3>
              <p>{guide.summary}</p>
              <div className="tag-row">
                {guide.tags.map((tag) => (
                  <span className="tag" key={`${guide.slug}:${tag}`}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="content-card-footer">
                <span className="list-muted">{guide.steps.length} key steps</span>
                <Link className="btn-ghost" href={`/docs/${guide.slug}`}>
                  Open guide
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}

