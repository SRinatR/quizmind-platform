import Link from 'next/link';

import { SiteShell } from '../../components/site-shell';
import { changelogEntries, type ChangelogEntryType } from '../../content/changelog-entries';

const entryTypeLabels: Record<ChangelogEntryType, string> = {
  feature: 'Feature',
  improvement: 'Improvement',
  fix: 'Fix',
  operations: 'Operations',
};

function formatReleaseDate(value: string): string {
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

function getLatestReleaseDate(): string | null {
  const first = changelogEntries[0];

  return first ? formatReleaseDate(first.publishedAt) : null;
}

export default function ChangelogPage() {
  const latestReleaseDate = getLatestReleaseDate();
  const inProgressFollowUps = changelogEntries.reduce((count, entry) => {
    return count + (entry.followUps?.length ?? 0);
  }, 0);

  return (
    <SiteShell
      apiState="Public release feed"
      currentPersona="platform-admin"
      description="Chronological release notes for platform, dashboard, billing, and extension integration work."
      eyebrow="Changelog"
      pathname="/changelog"
      showPersonaSwitcher={false}
      title="Platform shipping timeline"
    >
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">Releases</span>
          <p className="stat-value">{changelogEntries.length}</p>
          <p className="metric-copy">documented entries</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Latest</span>
          <p className="stat-value">{latestReleaseDate ? 'Current' : 'N/A'}</p>
          <p className="metric-copy">{latestReleaseDate ?? 'No releases yet'}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Follow-up items</span>
          <p className="stat-value">{inProgressFollowUps}</p>
          <p className="metric-copy">tracked from release notes</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Delivery scope</span>
          <p className="stat-value">Web + API</p>
          <p className="metric-copy">extension and ops included</p>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Release feed</span>
        <h2>Recent changes</h2>
        <div className="public-feed">
          {changelogEntries.map((entry) => (
            <article className="public-feed-item" key={entry.id}>
              <div className="public-feed-meta">
                <span className="status-pill">{entryTypeLabels[entry.type]}</span>
                <span className="tag">{entry.version}</span>
                <span className="list-muted">{formatReleaseDate(entry.publishedAt)}</span>
              </div>
              <h3>{entry.title}</h3>
              <p>{entry.summary}</p>
              <div className="tag-row">
                {entry.domains.map((domain) => (
                  <span className="tag" key={`${entry.id}:${domain}`}>
                    {domain}
                  </span>
                ))}
              </div>
              {entry.followUps && entry.followUps.length > 0 ? (
                <div className="mini-list">
                  {entry.followUps.map((item) => (
                    <div className="list-item" key={`${entry.id}:${item}`}>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {entry.links && entry.links.length > 0 ? (
                <div className="link-row">
                  {entry.links.map((link) => (
                    <Link className="btn-ghost" href={link.href} key={`${entry.id}:${link.href}`}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}

