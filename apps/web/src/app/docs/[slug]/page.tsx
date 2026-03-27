import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteShell } from '../../../components/site-shell';
import { docsGuides } from '../../../content/docs-guides';

interface DocsGuidePageProps {
  params: Promise<{
    slug: string;
  }>;
}

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

export function generateStaticParams() {
  return docsGuides.map((guide) => ({
    slug: guide.slug,
  }));
}

export default async function DocsGuidePage({ params }: DocsGuidePageProps) {
  const { slug } = await params;
  const guide = docsGuides.find((entry) => entry.slug === slug);

  if (!guide) {
    notFound();
  }

  return (
    <SiteShell
      apiState="Docs guide"
      currentPersona="platform-admin"
      description={guide.summary}
      eyebrow="Guide"
      pathname={`/docs/${guide.slug}`}
      showPersonaSwitcher={false}
      title={guide.title}
    >
      <section className="panel article-header">
        <div className="content-meta">
          <span className="status-pill">{guide.audience}</span>
          <span className="list-muted">Updated {formatDate(guide.updatedAt)}</span>
        </div>
        <div className="tag-row">
          {guide.tags.map((tag) => (
            <span className="tag" key={`${guide.slug}:${tag}`}>
              {tag}
            </span>
          ))}
        </div>
        <Link className="btn-ghost" href="/docs">
          Back to docs
        </Link>
      </section>

      <section className="panel article-layout">
        <span className="micro-label">Prerequisites</span>
        <h2>Before you start</h2>
        <div className="mini-list">
          {guide.prerequisites.map((item) => (
            <div className="list-item" key={`${guide.slug}:${item}`}>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel article-layout">
        <span className="micro-label">Runbook</span>
        <h2>Execution steps</h2>
        <div className="mini-list">
          {guide.steps.map((step, index) => (
            <div className="list-item" key={`${guide.slug}:${step}`}>
              <strong>Step {index + 1}</strong>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel article-layout">
        <span className="micro-label">Guide details</span>
        <h2>Context and safeguards</h2>
        <div className="article-prose">
          {guide.sections.map((section) => (
            <article className="article-section" key={`${guide.slug}:${section.heading}`}>
              <h3>{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={`${guide.slug}:${section.heading}:${paragraph}`}>{paragraph}</p>
              ))}
            </article>
          ))}
        </div>
        {guide.links && guide.links.length > 0 ? (
          <div className="link-row">
            {guide.links.map((link) => (
              <Link className="btn-ghost" href={link.href} key={`${guide.slug}:${link.href}`}>
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </SiteShell>
  );
}

