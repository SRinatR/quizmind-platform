'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  ticketStatuses,
  type SupportImpersonationResult,
  type SupportTicketWorkflowUpdateResult,
  type TicketStatus,
} from '@quizmind/contracts';

import { type SupportTicketsSnapshot } from '../../../lib/api';

type SupportTicket = SupportTicketsSnapshot['items'][number];

interface SupportTicketsClientProps {
  canStartSupportSessions: boolean;
  currentUserId?: string | null;
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

export function SupportTicketsClient({
  canStartSupportSessions,
  currentUserId,
  isConnectedSession,
  items,
}: SupportTicketsClientProps) {
  const router = useRouter();
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
  const [, startRefresh] = useTransition();

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

      startRefresh(() => {
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

      startRefresh(() => {
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
        <p>No open support tickets are available in this environment.</p>
      )}
    </div>
  );
}
