'use client';

import Link from 'next/link';

import { usePreferences } from '../../../lib/preferences';
import { formatUtcDateTime } from '../../../lib/datetime';

interface HistoryItem {
  id: string;
  source: string;
  eventType: string;
  severity?: string;
  occurredAt: string;
  installationId?: string;
  actorId?: string;
  summary: string;
}

export interface HistoryPageClientProps {
  visibleItems: HistoryItem[];
  totalLoaded: number;
  fetchLimit: number;
  maxFetchLimit: number;
  effectivePage: number;
  pageSize: number;
  hasPrev: boolean;
  hasNext: boolean;
  previousHref: string;
  nextHref: string;
  telemetryCount: number;
  activityCount: number;
  aiCount: number;
  lastEventAt: string | undefined;
  source: string;
  eventType: string | undefined;
  installationId: string | undefined;
  actorId: string | undefined;
  canExportCsv: boolean;
  csvHref: string;
  csvFilename: string;
  clearHref: string;
  hasSession: boolean;
  hasHistory: boolean;
}

export function HistoryPageClient(props: HistoryPageClientProps) {
  const { t } = usePreferences();
  const th = t.historyPage;

  const {
    hasSession, hasHistory,
    visibleItems, totalLoaded, fetchLimit, maxFetchLimit,
    effectivePage, pageSize, hasPrev, hasNext, previousHref, nextHref,
    telemetryCount, activityCount, aiCount, lastEventAt,
    source, eventType, installationId, actorId,
    canExportCsv, csvHref, csvFilename, clearHref,
  } = props;

  if (!hasSession) {
    return (
      <section className="empty-state">
        <span className="micro-label">{th.signInRequired}</span>
        <h2>{th.signInRequiredHeading}</h2>
        <p>{th.signInRequiredDesc}</p>
      </section>
    );
  }

  if (!hasHistory) {
    return (
      <section className="empty-state">
        <span className="micro-label">{th.historyAccess}</span>
        <h2>{th.noHistoryHeading}</h2>
        <p>{th.noHistoryDesc}</p>
      </section>
    );
  }

  return (
    <>
      <section className="filter-panel">
        <div className="filter-panel__header">
          <span className="micro-label">{th.filtersLabel}</span>
          <h2>{th.queryHistory}</h2>
        </div>
        <form method="get">
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">{th.sourceFilter}</span>
              <select defaultValue={source} name="source">
                <option value="all">all</option>
                <option value="telemetry">telemetry</option>
                <option value="activity">activity</option>
                <option value="ai">ai</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.rowsPerPage}</span>
              <select defaultValue={String(pageSize)} name="limit">
                {[10, 25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.eventTypeFilter}</span>
              <input
                defaultValue={eventType ?? ''}
                name="eventType"
                placeholder="extension.quiz_answer_requested"
                type="text"
              />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.installationIdFilter}</span>
              <input
                defaultValue={source === 'activity' ? '' : (installationId ?? '')}
                disabled={source === 'activity'}
                name="installationId"
                placeholder="inst_chrome_1"
                type="text"
              />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.actorIdFilter}</span>
              <input
                defaultValue={source === 'telemetry' ? '' : (actorId ?? '')}
                disabled={source === 'telemetry'}
                name="actorId"
                placeholder="user_1"
                type="text"
              />
            </label>
          </div>
          <input name="page" type="hidden" value="1" />
          <div className="filter-actions">
            <button className="btn-primary" type="submit">{th.applyFilters}</button>
            <Link className="btn-ghost" href={clearHref}>{th.reset}</Link>
            <a
              aria-disabled={!canExportCsv}
              className={canExportCsv ? 'btn-ghost' : 'btn-ghost btn-ghost--disabled'}
              download={canExportCsv ? csvFilename : undefined}
              href={canExportCsv ? csvHref : undefined}
            >
              {th.exportCsv}
            </a>
            {!canExportCsv ? (
              <span className="list-muted" style={{ fontSize: '0.82rem' }}>
                {th.requiresExportPermission}
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span className="micro-label">{th.timeline}</span>
            <h2>{th.timelineTitle}</h2>
          </div>
          <div className="tag-row">
            {telemetryCount > 0 ? <span className="tag-soft tag-soft--gray">{telemetryCount} telemetry</span> : null}
            {activityCount > 0 ? <span className="tag-soft tag-soft--gray">{activityCount} activity</span> : null}
            {aiCount > 0 ? <span className="tag-soft tag-soft--gray">{aiCount} ai</span> : null}
          </div>
        </div>
        {visibleItems.length > 0 ? (
          <div className="event-list">
            {visibleItems.map((event) => (
              <div className="event-row" key={event.id}>
                <span className={
                  event.source === 'ai' ? 'event-dot event-dot--ai'
                  : event.source === 'activity' ? 'event-dot event-dot--activity'
                  : event.severity === 'warn' || event.severity === 'error' ? 'event-dot event-dot--warn'
                  : 'event-dot event-dot--info'
                } />
                <div className="event-row__body">
                  <span className="event-row__type">{event.eventType}</span>
                  {event.summary ? <p className="event-row__summary">{event.summary}</p> : null}
                  <span className="event-row__context">
                    {event.installationId ? event.installationId : th.noInstallation}
                    {event.actorId ? ` \u00B7 ${event.actorId}` : ''}
                  </span>
                </div>
                <div className="event-row__meta">
                  <div className="tag-row" style={{ justifyContent: 'flex-end', gap: '4px', marginBottom: '4px' }}>
                    <span className="tag-soft tag-soft--gray">{event.source}</span>
                    {event.severity ? (
                      <span className={
                        event.severity === 'warn' || event.severity === 'error'
                          ? 'tag-soft tag-soft--orange'
                          : 'tag-soft tag-soft--gray'
                      }>
                        {event.severity}
                      </span>
                    ) : null}
                  </div>
                  {formatUtcDateTime(event.occurredAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="micro-label">{th.noMatchingEvents}</span>
            <h2>{th.noMatchingEventsHeading}</h2>
            <p>{th.noMatchingEventsDesc}</p>
          </div>
        )}
        <div className="filter-actions" style={{ marginTop: '16px' }}>
          <span className="list-muted" style={{ fontSize: '0.82rem' }}>
            {totalLoaded} {totalLoaded === 1 ? th.rowSingular : th.rowPlural} {th.rowsLoaded}
            {fetchLimit === maxFetchLimit ? ` (${th.cappedAt} ${maxFetchLimit})` : ''}
            {' \u00B7 '}{th.page} {effectivePage}
          </span>
          {hasPrev ? <Link className="btn-ghost" href={previousHref}>{th.previous}</Link> : null}
          {hasNext ? <Link className="btn-ghost" href={nextHref}>{th.next}</Link> : null}
        </div>
        <div className="link-row" style={{ marginTop: '8px' }}>
          <Link className="btn-ghost" href="/app/usage">{th.usageSummary}</Link>
          <Link className="btn-ghost" href="/app/installations">{th.installationsLink}</Link>
          <Link className="btn-ghost" href="/app/billing">{th.billing}</Link>
        </div>
      </section>
    </>
  );
}
