'use client';

import Link from 'next/link';

import {
  roadmapItems,
  roadmapStatusOrder,
  type RoadmapItem,
  type RoadmapStatus,
} from '../../content/roadmap-items';
import { usePreferences } from '../../lib/preferences';

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

export function RoadmapContentClient() {
  const { t } = usePreferences();
  const tr = t.publicPages.roadmap;

  const grouped = groupRoadmapByStatus(roadmapItems);
  const plannedCount = grouped.planned.length;
  const inProgressCount = grouped.in_progress.length;
  const completedCount = grouped.completed.length;

  const statusLabels: Record<RoadmapStatus, string> = {
    in_progress: tr.inProgress,
    planned: tr.planned,
    completed: tr.completed,
  };

  const statusDescriptions: Record<RoadmapStatus, string> = {
    in_progress: tr.inProgressDesc,
    planned: tr.plannedDesc,
    completed: tr.completedDesc,
  };

  return (
    <>
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">{tr.inProgress}</span>
          <p className="stat-value">{inProgressCount}</p>
          <p className="metric-copy">{tr.activeDelivery}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tr.planned}</span>
          <p className="stat-value">{plannedCount}</p>
          <p className="metric-copy">{tr.upcomingSlots}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tr.completed}</span>
          <p className="stat-value">{completedCount}</p>
          <p className="metric-copy">{tr.landedMilestones}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{tr.visibilityModel}</span>
          <p className="stat-value">{tr.noHiddenScope}</p>
          <p className="metric-copy">{tr.stubsVisible}</p>
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
                  <span className="micro-label">{tr.noItems}</span>
                  <h2>{tr.noItemsHeading}</h2>
                  <p>{tr.noItemsDesc}</p>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
