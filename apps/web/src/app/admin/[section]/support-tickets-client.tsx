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
      const response = await fetch('/api/support/tickets/preset-favorite', {
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
      const response = await fetch('/api/support/tickets/update', {
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
      const response = await fetch('/api/support/impersonation', {
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
    <div className="admin-support-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      <div className="admin-support-presets">
        <div className="admin-support-preset-copy">
          <span className="micro-label">Queue presets</span>
          <p>
            Quick presets reuse common support views without rebuilding filters by hand. Saved presets float to the
            front for the current operator.
          </p>
        </div>
        <div className="admin-support-preset-grid">
          {orderedPresetDefinitions.map((preset) => {
            const isFavorited = favoritePresetSet.has(preset.key);

            return (
              <article className="admin-support-preset-card" key={preset.key}>
                <div className="admin-support-preset-copy">
                  <span className="micro-label">{isFavorited ? 'Saved preset' : 'Preset'}</span>
                  <strong>{preset.label}</strong>
                  <p>{preset.description}</p>
                </div>
                <div className="tag-row">
                  <span className="tag">{preset.filters.status.replace('_', ' ')}</span>
                  <span className="tag">ownership: {preset.filters.ownership.replace('_', ' ')}</span>
                  <span className="tag">{preset.filters.timelineLimit} history rows</span>
                </div>
                <div className="admin-support-preset-actions">
                  <button
                    className={filters.preset === preset.key ? 'btn-primary' : 'btn-ghost'}
                    disabled={isNavigating}
                    onClick={() => handleApplyPreset(preset.key)}
                    type="button"
                  >
                    {filters.preset === preset.key ? 'Preset active' : 'Open preset'}
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={isNavigating || !canManagePresetFavorites}
                    onClick={() => void handleToggleFavorite(preset.key, !isFavorited)}
                    type="button"
                  >
                    {isFavorited ? 'Remove favorite' : 'Save preset'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <p className="list-muted">
          {(supportTicketQueuePresetDefinitions.find((preset) => preset.key === filters.preset)?.description ??
            'Custom queue view. Adjust any of the filters below to build an ad hoc operator slice.')}
        </p>
      </div>

      <form className="admin-support-filters" onSubmit={handleApplyFilters}>
        <div className="admin-support-filter-grid">
          <label className="admin-ticket-field">
            <span className="micro-label">Queue scope</span>
            <select defaultValue={filters.status} disabled={isNavigating} name="ticketStatus">
              {supportTicketStatusFilters.map((status) => (
                <option key={status} value={status}>
                  {supportTicketStatusFilterLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-ticket-field">
            <span className="micro-label">Ownership</span>
            <select defaultValue={filters.ownership} disabled={isNavigating} name="ticketOwnership">
              {supportTicketOwnershipFilters.map((ownership) => (
                <option key={ownership} value={ownership}>
                  {supportTicketOwnershipFilterLabels[ownership]}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-ticket-field">
            <span className="micro-label">Search</span>
            <input
              defaultValue={filters.search ?? ''}
              disabled={isNavigating}
              name="ticketSearch"
              placeholder="subject, requester, workspace, note"
              type="text"
            />
          </label>
          <label className="admin-ticket-field">
            <span className="micro-label">Visible tickets</span>
            <select defaultValue={String(filters.limit)} disabled={isNavigating} name="ticketLimit">
              {ticketLimitOptions.map((limit) => (
                <option key={limit} value={limit}>
                  {limit} tickets
                </option>
              ))}
            </select>
          </label>
          <label className="admin-ticket-field">
            <span className="micro-label">History depth</span>
            <select defaultValue={String(filters.timelineLimit)} disabled={isNavigating} name="ticketTimeline">
              {timelineLimitOptions.map((limit) => (
                <option key={limit} value={limit}>
                  {limit} entries
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-user-actions">
          <button className="btn-primary" disabled={isNavigating} type="submit">
            {isNavigating ? 'Refreshing queue...' : 'Apply filters'}
          </button>
          <button
            className="btn-ghost"
            disabled={isNavigating || !hasActiveFilters}
            onClick={handleResetFilters}
            type="button"
          >
            Reset filters
          </button>
        </div>
      </form>

      {lastStartedSession && lastStartedTicket ? (
        <div className="admin-support-result">
          <span className="micro-label">Latest linked session</span>
          <strong>{lastStartedTicket.subject}</strong>
          <p>
            Session <span className="monospace">{lastStartedSession.impersonationSessionId}</span> created at{' '}
            {new Date(lastStartedSession.createdAt).toLocaleString()}.
          </p>
          <div className="admin-user-actions">
            <Link className="btn-ghost" href="/admin/support">
              Refresh support console
            </Link>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="list-stack">
          {items.map((ticket) => {
            const canManageTicket = isConnectedSession && canStartSupportSessions;
            const ticketIsBusy = isBusy(ticket.id);
            const draftStatus = getDraftStatus(ticket);
            const draftNote = getDraftNote(ticket);
            const isOwnedByCurrentUser = Boolean(currentUserId && ticket.assignedTo?.id === currentUserId);
            const ownerLabel = ticket.assignedTo
              ? ticket.assignedTo.displayName || ticket.assignedTo.email
              : 'Unassigned queue';

            return (
              <div className="list-item" key={ticket.id}>
                <strong>{ticket.subject}</strong>
                <p>{ticket.body}</p>
                <div className="tag-row">
                  <span className={ticket.status === 'open' ? 'tag' : 'tag warn'}>{ticket.status.replace('_', ' ')}</span>
                  {ticket.workspace ? <span className="tag">{ticket.workspace.name}</span> : null}
                  <span className="tag">{ticket.assignedTo ? `owner: ${ownerLabel}` : 'owner: queue'}</span>
                </div>
                <span className="list-muted">
                  requester: {ticket.requester.displayName || ticket.requester.email} ({ticket.requester.email})
                </span>
                <span className="list-muted">updated: {new Date(ticket.updatedAt).toLocaleString()}</span>
                {ticket.handoffNote ? <p className="admin-ticket-note">handoff note: {ticket.handoffNote}</p> : null}
                {ticket.timeline && ticket.timeline.length > 0 ? (
                  <div className="admin-ticket-timeline">
                    <span className="micro-label">Recent workflow history</span>
                    <div className="mini-list">
                      {ticket.timeline.map((entry) => (
                        <div className="admin-ticket-timeline-entry" key={entry.id}>
                          <strong>{entry.summary}</strong>
                          <span className="list-muted">
                            {entry.actor.displayName || entry.actor.email} - {new Date(entry.occurredAt).toLocaleString()}
                          </span>
                          {entry.handoffNote ? (
                            <span className="list-muted">note: {entry.handoffNote}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {canManageTicket ? (
                  <div className="admin-ticket-editor">
                    <label className="admin-ticket-field">
                      <span className="micro-label">Workflow status</span>
                      <select
                        disabled={ticketIsBusy}
                        onChange={(event) => {
                          const nextStatus = event.target.value as TicketStatus;

                          setDraftStatuses((current) => ({
                            ...current,
                            [ticket.id]: nextStatus,
                          }));
                        }}
                        value={draftStatus}
                      >
                        {ticketStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Handoff note</span>
                      <textarea
                        disabled={ticketIsBusy}
                        onChange={(event) => {
                          setDraftNotes((current) => ({
                            ...current,
                            [ticket.id]: event.target.value,
                          }));
                        }}
                        placeholder="Capture operator context, next step, or a handoff summary."
                        rows={3}
                        value={draftNote}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Session reason</span>
                      <textarea
                        disabled={ticketIsBusy}
                        onChange={(event) => {
                          setDraftSessionReasons((current) => ({
                            ...current,
                            [ticket.id]: event.target.value,
                          }));
                        }}
                        placeholder="Explain why the linked support session is being opened."
                        rows={3}
                        value={getDraftSessionReason(ticket)}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Session note</span>
                      <textarea
                        disabled={ticketIsBusy}
                        onChange={(event) => {
                          setDraftSessionNotes((current) => ({
                            ...current,
                            [ticket.id]: event.target.value,
                          }));
                        }}
                        placeholder="Capture support context that should be stored on the impersonation session."
                        rows={3}
                        value={getDraftSessionNote(ticket)}
                      />
                    </label>
                    <div className="admin-user-actions">
                      {currentUserId ? (
                        <button
                          className="btn-ghost"
                          disabled={ticketIsBusy}
                          onClick={() =>
                            void handleWorkflowUpdate(
                              ticket,
                              'claim',
                              {
                                supportTicketId: ticket.id,
                                assignedToUserId: currentUserId,
                                status: draftStatus === 'open' ? 'in_progress' : draftStatus,
                                handoffNote: draftNote.trim() || null,
                              },
                              `Claiming ${ticket.subject} for the current support operator...`,
                              (updatedTicket) =>
                                `${updatedTicket.subject} is now ${updatedTicket.status.replace('_', ' ')} and assigned to you. Refreshing support data...`,
                            )
                          }
                          type="button"
                        >
                          {ticketIsBusy && activeActionKey === `${ticket.id}:claim`
                            ? 'Claiming...'
                            : isOwnedByCurrentUser
                              ? 'Keep ownership'
                              : ticket.assignedTo
                                ? 'Take ownership'
                                : 'Claim ticket'}
                        </button>
                      ) : null}
                      {isOwnedByCurrentUser ? (
                        <button
                          className="btn-ghost"
                          disabled={ticketIsBusy}
                          onClick={() =>
                            void handleWorkflowUpdate(
                              ticket,
                              'release',
                              {
                                supportTicketId: ticket.id,
                                assignedToUserId: null,
                                status: 'open',
                                handoffNote: draftNote.trim() || null,
                              },
                              `Returning ${ticket.subject} to the shared queue...`,
                              () => `${ticket.subject} is back in the open queue. Refreshing support data...`,
                            )
                          }
                          type="button"
                        >
                          {ticketIsBusy && activeActionKey === `${ticket.id}:release` ? 'Returning...' : 'Return to queue'}
                        </button>
                      ) : null}
                      <button
                        className="btn-ghost"
                        disabled={ticketIsBusy}
                        onClick={() =>
                          void handleWorkflowUpdate(
                            ticket,
                            'save',
                            {
                              supportTicketId: ticket.id,
                              status: draftStatus,
                              handoffNote: draftNote.trim() || null,
                            },
                            `Saving workflow changes for ${ticket.subject}...`,
                            (updatedTicket) =>
                              updatedTicket.status === 'resolved' || updatedTicket.status === 'closed'
                                ? `${updatedTicket.subject} moved to ${updatedTicket.status.replace('_', ' ')} and will drop out of the active queue after refresh.`
                                : `${updatedTicket.subject} saved as ${updatedTicket.status.replace('_', ' ')}. Refreshing support data...`,
                          )
                        }
                        type="button"
                      >
                        {ticketIsBusy && activeActionKey === `${ticket.id}:save` ? 'Saving...' : 'Save workflow'}
                      </button>
                      <button
                        className="btn-primary"
                        disabled={ticketIsBusy}
                        onClick={() => void handleStartForTicket(ticket)}
                        type="button"
                      >
                        {ticketIsBusy && activeActionKey === `${ticket.id}:session`
                          ? 'Starting support session...'
                          : 'Start session for requester'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p>
          {hasActiveFilters
            ? 'No support tickets match the current filters.'
            : 'No open support tickets are available in this environment.'}
        </p>
      )}
    </div>
  );
}
