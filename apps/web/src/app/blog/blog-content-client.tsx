'use client';

import Link from 'next/link';

import { blogPosts } from '../../content/blog-posts';
import { usePreferences } from '../../lib/preferences';

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

export function BlogContentClient() {
  const { t } = usePreferences();
  const tb = t.publicPages.blog;

  const categories = Array.from(new Set(blogPosts.map((post) => post.category)));
  const latestPost = blogPosts[0];
  const averageReadingMinutes =
    blogPosts.length > 0
      ? Math.round(blogPosts.reduce((sum, post) => sum + post.readingMinutes, 0) / blogPosts.length)
      : 0;

  return (
    <>
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">{tb.posts}</span>
          <p className="stat-value">{blogPosts.length}</p>
          <p className="metric-copy">{tb.published}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tb.latestReleaseNote}</span>
          <p className="stat-value">{latestPost ? tb.current : 'N/A'}</p>
          <p className="metric-copy">{latestPost ? formatDate(latestPost.publishedAt) : tb.noPosts}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tb.categories}</span>
          <p className="stat-value">{categories.length}</p>
          <p className="metric-copy">{categories.join(', ')}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tb.readingTime}</span>
          <p className="stat-value">{averageReadingMinutes} min</p>
          <p className="metric-copy">{tb.avgPerPost}</p>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">{tb.recentPosts}</span>
        <h2>{tb.releaseContext}</h2>
        <div className="content-library">
          {blogPosts.map((post) => (
            <article className="content-card" key={post.slug}>
              <div className="content-meta">
                <span className="status-pill">{post.category}</span>
                <span className="tag">{post.readingMinutes} min</span>
                <span className="list-muted">{formatDate(post.publishedAt)}</span>
              </div>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
              <div className="tag-row">
                {post.tags.map((tag) => (
                  <span className="tag" key={`${post.slug}:${tag}`}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="content-card-footer">
                <span className="list-muted">{tb.by} {post.author}</span>
                <Link className="btn-ghost" href={`/blog/${post.slug}`}>
                  {tb.readPost}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
