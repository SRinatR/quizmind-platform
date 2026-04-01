'use client';

import Link from 'next/link';

import { changelogEntries, type ChangelogEntryType } from '../../content/changelog-entries';
import { usePreferences } from '../../lib/preferences';

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

export function ChangelogContentClient() {
  const { t } = usePreferences();
  const tc = t.publicPages.changelog;

  const entryTypeLabels: Record<ChangelogEntryType, string> = {
    feature: tc.typeFeature,
    improvement: tc.typeImprovement,
    fix: tc.typeFix,
    operations: tc.typeOperations,
  };

  const latestReleaseDate = getLatestReleaseDate();
  const inProgressFollowUps = changelogEntries.reduce((count, entry) => {
    return count + (entry.followUps?.length ?? 0);
  }, 0);

  return (
    <>
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">{tc.releases}</span>
          <p className="stat-value">{changelogEntries.length}</p>
          <p className="metric-copy">{tc.documented}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tc.latest}</span>
          <p className="stat-value">{latestReleaseDate ? tc.current : 'N/A'}</p>
          <p className="metric-copy">{latestReleaseDate ?? tc.noReleasesYet}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tc.followUpItems}</span>
          <p className="stat-value">{inProgressFollowUps}</p>
          <p className="metric-copy">{tc.tracked}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tc.deliveryScope}</span>
          <p className="stat-value">{tc.webAndApi}</p>
          <p className="metric-copy">{tc.extAndOps}</p>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">{tc.releaseFeed}</span>
        <h2>{tc.recentChanges}</h2>
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
    </>
  );
}
