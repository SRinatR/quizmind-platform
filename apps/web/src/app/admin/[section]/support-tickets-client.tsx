'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { type SupportImpersonationResult } from '@quizmind/contracts';

import { type SupportTicketsSnapshot } from '../../../lib/api';

type SupportTicket = SupportTicketsSnapshot['items'][number];

interface SupportTicketsClientProps {
  canStartSupportSessions: boolean;
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

export function SupportTicketsClient({
  canStartSupportSessions,
  isConnectedSession,
  items,
}: SupportTicketsClientProps) {
  const router = useRouter();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? canStartSupportSessions
        ? 'Open tickets can launch a linked support session for the requester.'
        : 'This connected session can read the queue but cannot launch support sessions.'
      : 'Persona preview is read-only. Sign in with a connected support-capable account to launch live support sessions.',
  );
  const [lastStartedSession, setLastStartedSession] = useState<SupportImpersonationResult | null>(null);
  const [lastStartedTicket, setLastStartedTicket] = useState<SupportTicket | null>(null);
  const [, startRefresh] = useTransition();

  async function handleStartForTicket(ticket: SupportTicket) {
    setActiveTicketId(ticket.id);
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
          reason: `Support ticket ${ticket.id}: ${ticket.subject}`,
          operatorNote: `Linked from the support queue while handling ticket "${ticket.subject}".`,
        }),
      });

      const payload = (await response.json().catch(() => null)) as SupportImpersonationRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveTicketId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to start the linked support session right now.');
        return;
      }

      setActiveTicketId(null);
      setLastStartedSession(payload.data);
      setLastStartedTicket(ticket);
      setStatusMessage(`Ticket-linked support session started for ${ticket.requester.displayName || ticket.requester.email}. Refreshing support data...`);

      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setActiveTicketId(null);
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
            const canStartForTicket = isConnectedSession && canStartSupportSessions;

            return (
              <div className="list-item" key={ticket.id}>
                <strong>{ticket.subject}</strong>
                <p>{ticket.body}</p>
                <div className="tag-row">
                  <span className={ticket.status === 'open' ? 'tag' : 'tag warn'}>{ticket.status.replace('_', ' ')}</span>
                  {ticket.workspace ? <span className="tag">{ticket.workspace.name}</span> : null}
                </div>
                <span className="list-muted">
                  requester: {ticket.requester.displayName || ticket.requester.email} ({ticket.requester.email})
                </span>
                <span className="list-muted">updated: {new Date(ticket.updatedAt).toLocaleString()}</span>
                {canStartForTicket ? (
                  <div className="admin-user-actions">
                    <button
                      className="btn-primary"
                      disabled={activeTicketId === ticket.id}
                      onClick={() => void handleStartForTicket(ticket)}
                      type="button"
                    >
                      {activeTicketId === ticket.id ? 'Starting support session...' : 'Start session for requester'}
                    </button>
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
