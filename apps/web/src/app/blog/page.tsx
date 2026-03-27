import Link from 'next/link';

import { SiteShell } from '../../components/site-shell';
import { blogPosts } from '../../content/blog-posts';

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

export default function BlogPage() {
  const categories = Array.from(new Set(blogPosts.map((post) => post.category)));
  const latestPost = blogPosts[0];
  const averageReadingMinutes =
    blogPosts.length > 0
      ? Math.round(blogPosts.reduce((sum, post) => sum + post.readingMinutes, 0) / blogPosts.length)
      : 0;

  return (
    <SiteShell
      apiState="Public blog"
      currentPersona="platform-admin"
      description="Engineering notes, release context, and implementation decisions from QuizMind platform delivery."
      eyebrow="Blog"
      pathname="/blog"
      showPersonaSwitcher={false}
      title="Product and engineering journal"
    >
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">Posts</span>
          <p className="stat-value">{blogPosts.length}</p>
          <p className="metric-copy">published entries</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Latest release note</span>
          <p className="stat-value">{latestPost ? 'Current' : 'N/A'}</p>
          <p className="metric-copy">{latestPost ? formatDate(latestPost.publishedAt) : 'No posts yet'}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Categories</span>
          <p className="stat-value">{categories.length}</p>
          <p className="metric-copy">{categories.join(', ')}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Reading time</span>
          <p className="stat-value">{averageReadingMinutes} min</p>
          <p className="metric-copy">average per post</p>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Recent posts</span>
        <h2>Release context and implementation notes</h2>
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
                <span className="list-muted">By {post.author}</span>
                <Link className="btn-ghost" href={`/blog/${post.slug}`}>
                  Read post
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}

