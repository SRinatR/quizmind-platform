import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteShell } from '../../../components/site-shell';
import { blogPosts } from '../../../content/blog-posts';

interface BlogPostPageProps {
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
  return blogPosts.map((post) => ({
    slug: post.slug,
  }));
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = blogPosts.find((item) => item.slug === slug);

  if (!post) {
    notFound();
  }

  return (
    <SiteShell
      apiState="Public blog article"
      currentPersona="platform-admin"
      description={post.excerpt}
      eyebrow="Blog article"
      pathname={`/blog/${post.slug}`}
      showPersonaSwitcher={false}
      title={post.title}
    >
      <section className="panel article-header">
        <div className="content-meta">
          <span className="status-pill">{post.category}</span>
          <span className="tag">{post.readingMinutes} min</span>
          <span className="list-muted">{formatDate(post.publishedAt)}</span>
        </div>
        <p className="list-muted">By {post.author}</p>
        <div className="tag-row">
          {post.tags.map((tag) => (
            <span className="tag" key={`${post.slug}:${tag}`}>
              {tag}
            </span>
          ))}
        </div>
        <Link className="btn-ghost" href="/blog">
          Back to blog
        </Link>
      </section>

      <section className="panel article-layout">
        <span className="micro-label">Highlights</span>
        <h2>Key points</h2>
        <div className="mini-list">
          {post.highlights.map((highlight) => (
            <div className="list-item" key={`${post.slug}:${highlight}`}>
              <p>{highlight}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel article-layout">
        <span className="micro-label">Article</span>
        <h2>Details</h2>
        <div className="article-prose">
          {post.sections.map((section) => (
            <article className="article-section" key={`${post.slug}:${section.heading}`}>
              <h3>{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={`${post.slug}:${section.heading}:${paragraph}`}>{paragraph}</p>
              ))}
            </article>
          ))}
        </div>
        {post.links && post.links.length > 0 ? (
          <div className="link-row">
            {post.links.map((link) => (
              <Link className="btn-ghost" href={link.href} key={`${post.slug}:${link.href}`}>
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </SiteShell>
  );
}

