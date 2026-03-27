import Link from 'next/link';

import { SiteShell } from '../../components/site-shell';
import {
  roadmapItems,
  roadmapStatusOrder,
  type RoadmapItem,
  type RoadmapStatus,
} from '../../content/roadmap-items';

const statusLabels: Record<RoadmapStatus, string> = {
  in_progress: 'In progress',
  planned: 'Planned',
  completed: 'Completed',
};

const statusDescriptions: Record<RoadmapStatus, string> = {
  in_progress: 'Active delivery tracks in the current execution window.',
  planned: 'Approved next work with defined target windows.',
  completed: 'Recently delivered tracks still visible for context.',
};

function groupRoadmapByStatus(items: RoadmapItem[]): Record<RoadmapStatus, RoadmapItem[]> {
  return items.reduce<Record<RoadmapStatus, RoadmapItem[]>>(
    (accumulator, item) => {
      accumulator[item.status].push(item);
      return accumulator;
    },
    {
      planned: [],
      in_progress: [],
      completed: [],
    },
  );
}

export default function RoadmapPage() {
  const grouped = groupRoadmapByStatus(roadmapItems);
  const plannedCount = grouped.planned.length;
  const inProgressCount = grouped.in_progress.length;
  const completedCount = grouped.completed.length;

  return (
    <SiteShell
      apiState="Public roadmap"
      currentPersona="platform-admin"
      description="Execution tracks for platform delivery with transparent status and linked operational surfaces."
      eyebrow="Roadmap"
      pathname="/roadmap"
      showPersonaSwitcher={false}
      title="Delivery tracks and milestones"
    >
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">In progress</span>
          <p className="stat-value">{inProgressCount}</p>
          <p className="metric-copy">active delivery tracks</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Planned</span>
          <p className="stat-value">{plannedCount}</p>
          <p className="metric-copy">upcoming execution slots</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Completed</span>
          <p className="stat-value">{completedCount}</p>
          <p className="metric-copy">landed milestones</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Visibility model</span>
          <p className="stat-value">No hidden scope</p>
          <p className="metric-copy">stubs and read-only views stay visible</p>
        </article>
      </section>

      <section className="roadmap-board">
        {roadmapStatusOrder.map((status) => (
          <article className="panel roadmap-column" key={status}>
            <span className="micro-label">{statusLabels[status]}</span>
            <h2>{statusLabels[status]}</h2>
            <p className="roadmap-column-copy">{statusDescriptions[status]}</p>
            <div className="roadmap-column-items">
              {grouped[status].map((item) => (
                <div className="roadmap-card" key={item.id}>
                  <div className="public-feed-meta">
                    <span className="status-pill">{item.targetWindow}</span>
                    <span className="tag">{item.owner}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <div className="tag-row">
                    {item.streams.map((stream) => (
                      <span className="tag" key={`${item.id}:${stream}`}>
                        {stream}
                      </span>
                    ))}
                  </div>
                  {item.links && item.links.length > 0 ? (
                    <div className="link-row">
                      {item.links.map((link) => (
                        <Link className="btn-ghost" href={link.href} key={`${item.id}:${link.href}`}>
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {grouped[status].length === 0 ? (
                <div className="empty-state">
                  <span className="micro-label">No items</span>
                  <h2>Nothing scheduled in this status bucket yet.</h2>
                  <p>New milestones will appear here when the next delivery window is scoped.</p>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </SiteShell>
  );
}

