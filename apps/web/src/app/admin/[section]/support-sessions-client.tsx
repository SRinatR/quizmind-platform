'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { type SupportImpersonationEndResult } from '@quizmind/contracts';

import { type SupportImpersonationSnapshot } from '../../../lib/api';

type SupportSession = SupportImpersonationSnapshot['items'][number];

interface SupportSessionsClientProps {
  canEndSupportSessions: boolean;
  isConnectedSession: boolean;
  items: SupportSession[];
}

interface SupportImpersonationEndRouteResponse {
  ok: boolean;
  data?: SupportImpersonationEndResult;
  error?: {
    message?: string;
  };
}

export function SupportSessionsClient({
  canEndSupportSessions,
  isConnectedSession,
  items,
}: SupportSessionsClientProps) {
  const router = useRouter();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? canEndSupportSessions
        ? 'Active support sessions can be closed directly from this screen.'
        : 'This connected session can read support history but cannot end support sessions.'
      : 'Persona preview is read-only. Sign in with a connected support-capable account to manage live sessions.',
  );
  const [lastEndedSession, setLastEndedSession] = useState<SupportImpersonationEndResult | null>(null);
  const [, startRefresh] = useTransition();

  async function handleEndSession(item: SupportSession) {
    setActiveSessionId(item.impersonationSessionId);
    setErrorMessage(null);
    setLastEndedSession(null);
    setStatusMessage(
      `Ending support access for ${item.targetUser.displayName || item.targetUser.email}...`,
    );

    try {
      const response = await fetch('/api/support/impersonation/end', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          impersonationSessionId: item.impersonationSessionId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as SupportImpersonationEndRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveSessionId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to end the support session right now.');
        return;
      }

      setActiveSessionId(null);
      setLastEndedSession(payload.data);
      setStatusMessage(
        `Support session ${payload.data.impersonationSessionId} closed. Refreshing support history...`,
      );

      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setActiveSessionId(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the support session route right now.');
    }
  }

  return (
    <div className="admin-support-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      {lastEndedSession ? (
        <div className="admin-support-result">
          <span className="micro-label">Latest closed session</span>
          <strong>{lastEndedSession.impersonationSessionId}</strong>
          <p>Closed at {new Date(lastEndedSession.endedAt).toLocaleString()}.</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="list-stack">
          {items.map((item) => {
            const isActive = !item.endedAt;

            return (
              <div className="list-item" key={item.impersonationSessionId}>
                <strong>
                  {item.supportActor.displayName || item.supportActor.email} {'->'}{' '}
                  {item.targetUser.displayName || item.targetUser.email}
                </strong>
                <p>{item.reason}</p>
                <div className="tag-row">
                  <span className={isActive ? 'tag' : 'tag warn'}>
                    {isActive ? 'active session' : 'ended'}
                  </span>
                  {item.workspace ? <span className="tag">{item.workspace.name}</span> : null}
                  {item.supportTicket ? <span className="tag">ticket linked</span> : null}
                </div>
                <span className="list-muted">started: {new Date(item.createdAt).toLocaleString()}</span>
                <span className="list-muted">
                  ended: {item.endedAt ? new Date(item.endedAt).toLocaleString() : 'still active'}
                </span>
                {item.supportTicket ? (
                  <span className="list-muted">
                    ticket: {item.supportTicket.subject} ({item.supportTicket.status.replace('_', ' ')})
                  </span>
                ) : null}
                {item.operatorNote ? <span className="list-muted">operator note: {item.operatorNote}</span> : null}
                {isActive && isConnectedSession && canEndSupportSessions ? (
                  <div className="admin-user-actions">
                    <button
                      className="btn-primary"
                      disabled={activeSessionId === item.impersonationSessionId}
                      onClick={() => void handleEndSession(item)}
                      type="button"
                    >
                      {activeSessionId === item.impersonationSessionId ? 'Ending session...' : 'End session'}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p>No impersonation sessions have been recorded yet for this environment.</p>
      )}
    </div>
  );
}
