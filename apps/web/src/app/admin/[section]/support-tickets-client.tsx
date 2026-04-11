'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import {
  supportTicketOwnershipFilters,
  supportTicketQueuePresetDefinitions,
  supportTicketStatusFilters,
  ticketStatuses,
  type SupportImpersonationResult,
  type SupportTicketOwnershipFilter,
  type SupportTicketQueuePreset,
  type SupportTicketStatusFilter,
  type SupportTicketWorkflowUpdateResult,
  type TicketStatus,
} from '@quizmind/contracts';

import { type SupportTicketsSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

type SupportTicket = SupportTicketsSnapshot['items'][number];

interface SupportTicketsClientProps {
  canStartSupportSessions: boolean;
  currentUserId?: string | null;
  favoritePresets: SupportTicketsSnapshot['favoritePresets'];
  filters: SupportTicketsSnapshot['filters'];
  isConnectedSession: boolean;
  items: SupportTicket[];
}

interface SupportImpersonationRouteResponse {
  ok: boolean;
  data?: SupportImpersonationResult;
  error?: {
    message?: string;
  };
}

interface SupportTicketWorkflowRouteResponse {
  ok: boolean;
  data?: SupportTicketWorkflowUpdateResult;
  error?: {
    message?: string;
  };
}

interface SupportTicketPresetFavoriteRouteResponse {
  ok: boolean;
  data?: {
    preset: SupportTicketQueuePreset;
    favorite: boolean;
    favorites: SupportTicketQueuePreset[];
  };
  error?: {
    message?: string;
  };
}

const supportTicketStatusFilterLabels: Record<SupportTicketStatusFilter, string> = {
  active: 'Active queue',
  open: 'Open only',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  all: 'All statuses',
};

const supportTicketOwnershipFilterLabels: Record<SupportTicketOwnershipFilter, string> = {
  all: 'All tickets',
  mine: 'Assigned to me',
  unassigned: 'Shared queue',
};

const ticketLimitOptions = [8, 12, 20] as const;
const timelineLimitOptions = [2, 4, 8] as const;

export function SupportTicketsClient({
  canStartSupportSessions,
  currentUserId,
  favoritePresets,
  filters,
  isConnectedSession,
  items,
}: SupportTicketsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, TicketStatus>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [draftSessionReasons, setDraftSessionReasons] = useState<Record<string, string>>({});
  const [draftSessionNotes, setDraftSessionNotes] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? canStartSupportSessions
        ? 'Open tickets can be claimed, moved through workflow states, and used to launch linked support sessions with custom operator context.'
        : 'This connected session can read the queue but cannot manage support actions.'
      : 'Persona preview is read-only. Sign in with a connected support-capable account to manage live tickets.',
  );
  const [lastStartedSession, setLastStartedSession] = useState<SupportImpersonationResult | null>(null);
  const [lastStartedTicket, setLastStartedTicket] = useState<SupportTicket | null>(null);
  const [isNavigating, startNavigation] = useTransition();
  const canManagePresetFavorites = isConnectedSession && canStartSupportSessions;
  const favoritePresetSet = new Set(favoritePresets);
  const orderedPresetDefinitions = [...supportTicketQueuePresetDefinitions].sort((left, right) => {
    const leftFavoriteScore = favoritePresetSet.has(left.key) ? 1 : 0;
    const rightFavoriteScore = favoritePresetSet.has(right.key) ? 1 : 0;

    return rightFavoriteScore - leftFavoriteScore;
  });
  const hasActiveFilters =
    Boolean(filters.preset) ||
    filters.status !== 'active' ||
    filters.ownership !== 'all' ||
    Boolean(filters.search) ||
    filters.limit !== 8 ||
    filters.timelineLimit !== 4;

  function getDraftStatus(ticket: SupportTicket): TicketStatus {
    return draftStatuses[ticket.id] ?? ticket.status;
  }

  function getDraftNote(ticket: SupportTicket): string {
    return draftNotes[ticket.id] ?? ticket.handoffNote ?? '';
  }

  function getDraftSessionReason(ticket: SupportTicket): string {
    return draftSessionReasons[ticket.id] ?? `Support ticket ${ticket.id}: ${ticket.subject}`;
  }

  function getDraftSessionNote(ticket: SupportTicket): string {
    return (
      draftSessionNotes[ticket.id] ??
      draftNotes[ticket.id] ??
      ticket.handoffNote ??
      `Linked from the support queue while handling ticket "${ticket.subject}".`
    );
  }

  function isBusy(ticketId: string) {
    return activeActionKey?.startsWith(`${ticketId}:`) ?? false;
  }

  function navigateWithUpdatedSupportFilters(nextValues: {
    preset?: string;
    status?: string;
    ownership?: string;
    search?: string;
    limit?: string;
    timelineLimit?: string;
  }) {
    const nextParams = new URLSearchParams(searchParams.toString());
    const updates: Array<[string, string | undefined, string | undefined]> = [
      ['ticketPreset', nextValues.preset, undefined],
      ['ticketStatus', nextValues.status, 'active'],
      ['ticketOwnership', nextValues.ownership, 'all'],
      ['ticketSearch', nextValues.search, undefined],
      ['ticketLimit', nextValues.limit, '8'],
      ['ticketTimeline', nextValues.timelineLimit, '4'],
    ];

    for (const [key, value, defaultValue] of updates) {
      const normalizedValue = value?.trim();

      if (!normalizedValue || normalizedValue === defaultValue) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, normalizedValue);
      }
    }

    const nextUrl = nextParams.size > 0 ? `${pathname}?${nextParams.toString()}` : pathname;

    startNavigation(() => {
      router.replace(nextUrl);
    });
  }

  async function handleToggleFavorite(preset: SupportTicketQueuePreset, shouldFavorite: boolean) {
    setErrorMessage(null);
    setLastStartedSession(null);
    setLastStartedTicket(null);
    setStatusMessage(
      shouldFavorite
        ? `Saving "${supportTicketQueuePresetDefinitions.find((item) => item.key === preset)?.label ?? preset}" as a personal queue preset...`
        : `Removing "${supportTicketQueuePresetDefinitions.find((item) => item.key === preset)?.label ?? preset}" from your personal presets...`,
    );

    try {
      const response = await fetch('/bff/support/tickets/preset-favorite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          preset,
          favorite: shouldFavorite,
        }),
      });

      const payload = (await response.json().catch(() => null)) as SupportTicketPresetFavoriteRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to update the support preset favorite right now.');
        return;
      }

      setStatusMessage(
        shouldFavorite
          ? 'Support queue preset saved. Refreshing the operator console...'
          : 'Support queue preset removed from favorites. Refreshing the operator console...',
      );

      startNavigation(() => {
        router.refresh();
      });
    } catch {
      setStatusMessage(null);
      setErrorMessage('Unable to reach the support preset route right now.');
    }
  }

  function handleApplyPreset(preset: SupportTicketQueuePreset) {
    setErrorMessage(null);
    setLastStartedSession(null);
    setLastStartedTicket(null);
    const presetDefinition = supportTicketQueuePresetDefinitions.find((item) => item.key === preset);

    setStatusMessage(
      presetDefinition
        ? `Switching the support queue to "${presetDefinition.label}"...`
        : 'Switching the support queue preset...',
    );
    navigateWithUpdatedSupportFilters({
      preset,
      status: '',
      ownership: '',
      search: '',
      limit: '',
      timelineLimit: '',
    });
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setErrorMessage(null);
    setLastStartedSession(null);
    setLastStartedTicket(null);
    setStatusMessage('Refreshing the support queue with the selected filters...');
    navigateWithUpdatedSupportFilters({
      preset: '',
      status: String(formData.get('ticketStatus') ?? filters.status),
      ownership: String(formData.get('ticketOwnership') ?? filters.ownership),
      search: String(formData.get('ticketSearch') ?? ''),
      limit: String(formData.get('ticketLimit') ?? filters.limit),
      timelineLimit: String(formData.get('ticketTimeline') ?? filters.timelineLimit),
    });
  }

  function handleResetFilters() {
    setErrorMessage(null);
    setLastStartedSession(null);
    setLastStartedTicket(null);
    setStatusMessage('Resetting support queue filters...');
    navigateWithUpdatedSupportFilters({
      preset: '',
      status: 'active',
      ownership: 'all',
      search: '',
      limit: '8',
      timelineLimit: '4',
    });
  }

  async function handleWorkflowUpdate(
    ticket: SupportTicket,
    actionKey: string,
    body: {
      supportTicketId: string;
      status?: TicketStatus;
      assignedToUserId?: string | null;
      handoffNote?: string | null;
    },
    pendingMessage: string,
    successMessage: (updatedTicket: SupportTicketWorkflowUpdateResult) => string,
  ) {
    setActiveActionKey(`${ticket.id}:${actionKey}`);
    setErrorMessage(null);
    setStatusMessage(pendingMessage);

    try {
      const response = await fetch('/bff/support/tickets/update', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => null)) as SupportTicketWorkflowRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveActionKey(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to update the support ticket right now.');
        return;
      }

      const updatedTicket = payload.data;

      setDraftStatuses((current) => ({
        ...current,
        [ticket.id]: updatedTicket.status,
      }));
      setDraftNotes((current) => ({
        ...current,
        [ticket.id]: updatedTicket.handoffNote ?? '',
      }));
      setActiveActionKey(null);
      setStatusMessage(successMessage(updatedTicket));

      startNavigation(() => {
        router.refresh();
      });
    } catch {
      setActiveActionKey(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the support ticket workflow route right now.');
    }
  }

  async function handleStartForTicket(ticket: SupportTicket) {
    const sessionReason = getDraftSessionReason(ticket).trim();
    const sessionOperatorNote = getDraftSessionNote(ticket).trim() || undefined;

    if (!sessionReason) {
      setErrorMessage('Support session reason is required before launch.');
      setStatusMessage(null);
      return;
    }

    setActiveActionKey(`${ticket.id}:session`);
    setErrorMessage(null);
    setLastStartedSession(null);
    setLastStartedTicket(null);
    setStatusMessage(`Starting a ticket-linked support session for ${ticket.requester.displayName || ticket.requester.email}...`);

    try {
      const response = await fetch('/bff/support/impersonation', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: ticket.requester.id,
          workspaceId: ticket.workspace?.id,
          supportTicketId: ticket.id,
          reason: sessionReason,
          ...(sessionOperatorNote ? { operatorNote: sessionOperatorNote } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as SupportImpersonationRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveActionKey(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to start the linked support session right now.');
        return;
      }

      setActiveActionKey(null);
      setLastStartedSession(payload.data);
      setLastStartedTicket(ticket);
      setStatusMessage(`Ticket-linked support session started for ${ticket.requester.displayName || ticket.requester.email}. Refreshing support data...`);

      startNavigation(() => {
        router.refresh();
      });
    } catch {
      setActiveActionKey(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the support session route right now.');
    }
  }

  return (
    <>
      {statusMessage ? <div className="banner banner-info">{statusMessage}</div> : null}
      {errorMessage ? <div className="banner banner-error">{errorMessage}</div> : null}

      {/* ── Queue presets ── */}
      <section className="panel">
        <span className="micro-label">Queue presets</span>
        <h2>Operator queue views</h2>
        <div className="section-grid" style={{ marginTop: '12px' }}>
          {orderedPresetDefinitions.map((preset) => {
            const isFavorited = favoritePresetSet.has(preset.key);
            return (
              <article
                key={preset.key}
                className={filters.preset === preset.key ? 'section-card section-card--link' : 'section-card'}
                style={{ cursor: 'default' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                  <span className="micro-label">{isFavorited ? 'Saved preset' : 'Preset'}</span>
                  {filters.preset === preset.key ? <span className="tag-soft tag-soft--green">active</span> : null}
                </div>
                <h2 style={{ fontSize: '0.92rem', margin: '0 0 4px' }}>{preset.label}</h2>
                <p style={{ fontSize: '0.83rem', margin: '0 0 10px' }}>{preset.description}</p>
                <div className="tag-row" style={{ marginBottom: '10px', gap: '4px' }}>
                  <span className="tag-soft tag-soft--gray">{preset.filters.status.replace('_', ' ')}</span>
                  <span className="tag-soft tag-soft--gray">{preset.filters.ownership.replace('_', ' ')}</span>
                </div>
                <div className="link-row">
                  <button
                    className={filters.preset === preset.key ? 'btn-primary' : 'btn-ghost'}
                    disabled={isNavigating}
                    onClick={() => handleApplyPreset(preset.key)}
                    type="button"
                  >
                    {filters.preset === preset.key ? 'Active' : 'Open preset'}
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={isNavigating || !canManagePresetFavorites}
                    onClick={() => void handleToggleFavorite(preset.key, !isFavorited)}
                    type="button"
                  >
                    {isFavorited ? 'Unsave' : 'Save'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Filters ── */}
      <section className="filter-panel">
        <div className="filter-panel__header">
          <span className="micro-label">Filters</span>
          <h2>Queue filters</h2>
        </div>
        <form onSubmit={handleApplyFilters}>
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">Queue scope</span>
              <select defaultValue={filters.status} disabled={isNavigating} name="ticketStatus">
                {supportTicketStatusFilters.map((status) => (
                  <option key={status} value={status}>{supportTicketStatusFilterLabels[status]}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Ownership</span>
              <select defaultValue={filters.ownership} disabled={isNavigating} name="ticketOwnership">
                {supportTicketOwnershipFilters.map((ownership) => (
                  <option key={ownership} value={ownership}>{supportTicketOwnershipFilterLabels[ownership]}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Search</span>
              <input defaultValue={filters.search ?? ''} disabled={isNavigating} name="ticketSearch" placeholder="subject, requester, keyword" type="text" />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Visible tickets</span>
              <select defaultValue={String(filters.limit)} disabled={isNavigating} name="ticketLimit">
                {ticketLimitOptions.map((limit) => <option key={limit} value={limit}>{limit} tickets</option>)}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">History depth</span>
              <select defaultValue={String(filters.timelineLimit)} disabled={isNavigating} name="ticketTimeline">
                {timelineLimitOptions.map((limit) => <option key={limit} value={limit}>{limit} entries</option>)}
              </select>
            </label>
          </div>
          <div className="filter-actions">
            <button className="btn-primary" disabled={isNavigating} type="submit">
              {isNavigating ? 'Refreshing…' : 'Apply filters'}
            </button>
            <button className="btn-ghost" disabled={isNavigating || !hasActiveFilters} onClick={handleResetFilters} type="button">
              Reset
            </button>
          </div>
        </form>
      </section>

      {lastStartedSession && lastStartedTicket ? (
        <div className="connect-success" style={{ marginBottom: '4px' }}>
          <span className="micro-label">Session launched</span>
          <p><strong>{lastStartedTicket.subject}</strong></p>
          <p className="list-muted">Session {lastStartedSession.impersonationSessionId} created at {formatUtcDateTime(lastStartedSession.createdAt)}.</p>
          <div className="link-row" style={{ marginTop: '8px' }}>
            <Link className="btn-ghost" href="/admin/support">View support history</Link>
          </div>
        </div>
      ) : null}

      {/* ── Ticket queue ── */}
      {items.length > 0 ? (
        <div style={{ display: 'grid', gap: '12px' }}>
          {items.map((ticket) => {
            const canManageTicket = isConnectedSession && canStartSupportSessions;
            const ticketIsBusy = isBusy(ticket.id);
            const draftStatus = getDraftStatus(ticket);
            const draftNote = getDraftNote(ticket);
            const isOwnedByCurrentUser = Boolean(currentUserId && ticket.assignedTo?.id === currentUserId);
            const ownerLabel = ticket.assignedTo
              ? ticket.assignedTo.displayName || ticket.assignedTo.email
              : 'Unassigned';

            return (
              <div className="panel" style={{ padding: '16px 20px' }} key={ticket.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem' }}>{ticket.subject}</p>
                    <p className="list-muted" style={{ margin: '3px 0 0', fontSize: '0.84rem' }}>{ticket.body}</p>
                  </div>
                  <div className="tag-row">
                    <span className={ticket.status === 'open' ? 'tag-soft tag-soft--green' : ticket.status === 'in_progress' ? 'tag-soft' : 'tag-soft tag-soft--gray'}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                    {ticket.workspace ? <span className="tag-soft tag-soft--gray">{ticket.workspace.name}</span> : null}
                    <span className="tag-soft tag-soft--gray">{ownerLabel}</span>
                  </div>
                </div>
                <div className="kv-list">
                  <div className="kv-row">
                    <span className="kv-row__key">Requester</span>
                    <span className="kv-row__value">{ticket.requester.displayName || ticket.requester.email}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__key">Updated</span>
                    <span className="kv-row__value">{formatUtcDateTime(ticket.updatedAt)}</span>
                  </div>
                  {ticket.handoffNote ? (
                    <div className="kv-row">
                      <span className="kv-row__key">Handoff note</span>
                      <span className="kv-row__value">{ticket.handoffNote}</span>
                    </div>
                  ) : null}
                </div>
                {ticket.timeline && ticket.timeline.length > 0 ? (
                  <div style={{ marginTop: '10px' }}>
                    <span className="micro-label">Workflow history</span>
                    <div className="event-list" style={{ marginTop: '6px' }}>
                      {ticket.timeline.map((entry) => (
                        <div className="event-row" key={entry.id}>
                          <span className="event-dot event-dot--activity" />
                          <div className="event-row__body">
                            <span className="event-row__type">{entry.summary}</span>
                            {entry.handoffNote ? <p className="event-row__summary">{entry.handoffNote}</p> : null}
                          </div>
                          <div className="event-row__meta">
                            {entry.actor.displayName || entry.actor.email}<br />
                            {formatUtcDateTime(entry.occurredAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {canManageTicket ? (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(31,41,51,0.07)' }}>
                    <div className="form-grid" style={{ marginBottom: '10px' }}>
                      <label className="form-field">
                        <span className="form-field__label">Workflow status</span>
                        <select disabled={ticketIsBusy} onChange={(event) => { setDraftStatuses((current) => ({ ...current, [ticket.id]: event.target.value as TicketStatus })); }} value={draftStatus}>
                          {ticketStatuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                        </select>
                      </label>
                      <label className="form-field">
                        <span className="form-field__label">Handoff note</span>
                        <textarea disabled={ticketIsBusy} onChange={(event) => { setDraftNotes((current) => ({ ...current, [ticket.id]: event.target.value })); }} placeholder="Operator context, next step, or handoff summary." rows={2} value={draftNote} />
                      </label>
                      <label className="form-field">
                        <span className="form-field__label">Session reason</span>
                        <textarea disabled={ticketIsBusy} onChange={(event) => { setDraftSessionReasons((current) => ({ ...current, [ticket.id]: event.target.value })); }} placeholder="Why this linked support session is being opened." rows={2} value={getDraftSessionReason(ticket)} />
                      </label>
                      <label className="form-field">
                        <span className="form-field__label">Session note</span>
                        <textarea disabled={ticketIsBusy} onChange={(event) => { setDraftSessionNotes((current) => ({ ...current, [ticket.id]: event.target.value })); }} placeholder="Context stored on the impersonation session." rows={2} value={getDraftSessionNote(ticket)} />
                      </label>
                    </div>
                    <div className="link-row">
                      {currentUserId ? (
                        <button className="btn-ghost" disabled={ticketIsBusy} onClick={() => void handleWorkflowUpdate(ticket, 'claim', { supportTicketId: ticket.id, assignedToUserId: currentUserId, status: draftStatus === 'open' ? 'in_progress' : draftStatus, handoffNote: draftNote.trim() || null }, `Claiming ${ticket.subject}…`, (u) => `${u.subject} is now ${u.status.replace('_', ' ')}.`)} type="button">
                          {ticketIsBusy && activeActionKey === `${ticket.id}:claim` ? 'Claiming…' : isOwnedByCurrentUser ? 'Keep ownership' : ticket.assignedTo ? 'Take ownership' : 'Claim ticket'}
                        </button>
                      ) : null}
                      {isOwnedByCurrentUser ? (
                        <button className="btn-ghost" disabled={ticketIsBusy} onClick={() => void handleWorkflowUpdate(ticket, 'release', { supportTicketId: ticket.id, assignedToUserId: null, status: 'open', handoffNote: draftNote.trim() || null }, `Returning ${ticket.subject} to queue…`, () => `${ticket.subject} back in open queue.`)} type="button">
                          {ticketIsBusy && activeActionKey === `${ticket.id}:release` ? 'Returning…' : 'Return to queue'}
                        </button>
                      ) : null}
                      <button className="btn-ghost" disabled={ticketIsBusy} onClick={() => void handleWorkflowUpdate(ticket, 'save', { supportTicketId: ticket.id, status: draftStatus, handoffNote: draftNote.trim() || null }, `Saving ${ticket.subject}…`, (u) => `${u.subject} saved as ${u.status.replace('_', ' ')}.`)} type="button">
                        {ticketIsBusy && activeActionKey === `${ticket.id}:save` ? 'Saving…' : 'Save workflow'}
                      </button>
                      <button className="btn-primary" disabled={ticketIsBusy} onClick={() => void handleStartForTicket(ticket)} type="button">
                        {ticketIsBusy && activeActionKey === `${ticket.id}:session` ? 'Starting session…' : 'Start session'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <span className="micro-label">{hasActiveFilters ? 'No results' : 'Empty queue'}</span>
          <h2>{hasActiveFilters ? 'No tickets match the current filters' : 'No open support tickets in this environment'}</h2>
        </div>
      )}
    </>
  );
}
