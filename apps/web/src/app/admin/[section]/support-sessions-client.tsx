'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { type SupportImpersonationEndResult } from '@quizmind/contracts';

import { type SupportImpersonationSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

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
  const [draftCloseReasons, setDraftCloseReasons] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? canEndSupportSessions
        ? 'Active support sessions can be closed directly from this screen with an operator close reason.'
        : 'This connected session can read support history but cannot end support sessions.'
      : 'Persona preview is read-only. Sign in with a connected support-capable account to manage live sessions.',
  );
  const [lastEndedSession, setLastEndedSession] = useState<SupportImpersonationEndResult | null>(null);
  const [, startRefresh] = useTransition();

  function getDraftCloseReason(item: SupportSession): string {
    return draftCloseReasons[item.impersonationSessionId] ?? item.closeReason ?? '';
  }

  async function handleEndSession(item: SupportSession) {
    const closeReason = getDraftCloseReason(item).trim() || undefined;

    setActiveSessionId(item.impersonationSessionId);
    setErrorMessage(null);
    setLastEndedSession(null);
    setStatusMessage(
      `Ending support access for ${item.targetUser.displayName || item.targetUser.email}...`,
    );

    try {
      const response = await fetch('/bff/support/impersonation/end', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          impersonationSessionId: item.impersonationSessionId,
          ...(closeReason ? { closeReason } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as SupportImpersonationEndRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveSessionId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to end the support session right now.');
        return;
      }

      setDraftCloseReasons((current) => ({
        ...current,
        [item.impersonationSessionId]: payload.data?.closeReason ?? closeReason ?? '',
      }));
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
    <>
      {statusMessage ? <div className="banner banner-info">{statusMessage}</div> : null}
      {errorMessage ? <div className="banner banner-error">{errorMessage}</div> : null}

      {lastEndedSession ? (
        <div className="connect-success" style={{ marginBottom: '16px' }}>
          <span className="micro-label">Session closed</span>
          <p><strong>{lastEndedSession.impersonationSessionId}</strong></p>
          <p className="list-muted">Closed at {formatUtcDateTime(lastEndedSession.endedAt)}.</p>
          {lastEndedSession.closeReason ? (
            <p className="list-muted">Reason: {lastEndedSession.closeReason}</p>
          ) : null}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div style={{ display: 'grid', gap: '12px' }}>
          {items.map((item) => {
            const isActive = !item.endedAt;
            const draftCloseReason = getDraftCloseReason(item);

            return (
              <div className="panel" style={{ padding: '16px 20px' }} key={item.impersonationSessionId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                      {item.supportActor.displayName || item.supportActor.email}
                      <span style={{ opacity: 0.5, margin: '0 6px' }}>→</span>
                      {item.targetUser.displayName || item.targetUser.email}
                    </p>
                    <p className="list-muted" style={{ margin: '2px 0 0', fontSize: '0.84rem' }}>{item.reason}</p>
                  </div>
                  <div className="tag-row">
                    <span className={isActive ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--gray'}>
                      {isActive ? 'active' : 'ended'}
                    </span>
                    {item.supportTicket ? <span className="tag-soft tag-soft--gray">ticket linked</span> : null}
                  </div>
                </div>
                <div className="kv-list">
                  <div className="kv-row">
                    <span className="kv-row__key">Started</span>
                    <span className="kv-row__value">{formatUtcDateTime(item.createdAt)}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__key">Ended</span>
                    <span className="kv-row__value">{item.endedAt ? formatUtcDateTime(item.endedAt) : 'Still active'}</span>
                  </div>
                  {item.supportTicket ? (
                    <div className="kv-row">
                      <span className="kv-row__key">Ticket</span>
                      <span className="kv-row__value">{item.supportTicket.subject} ({item.supportTicket.status.replace('_', ' ')})</span>
                    </div>
                  ) : null}
                  {item.operatorNote ? (
                    <div className="kv-row">
                      <span className="kv-row__key">Operator note</span>
                      <span className="kv-row__value">{item.operatorNote}</span>
                    </div>
                  ) : null}
                  {item.closeReason ? (
                    <div className="kv-row">
                      <span className="kv-row__key">Close reason</span>
                      <span className="kv-row__value">{item.closeReason}</span>
                    </div>
                  ) : null}
                </div>
                {isActive && isConnectedSession && canEndSupportSessions ? (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(31,41,51,0.07)' }}>
                    <label className="form-field" style={{ marginBottom: '8px' }}>
                      <span className="form-field__label">Close reason</span>
                      <textarea
                        disabled={activeSessionId === item.impersonationSessionId}
                        onChange={(event) => {
                          setDraftCloseReasons((current) => ({
                            ...current,
                            [item.impersonationSessionId]: event.target.value,
                          }));
                        }}
                        placeholder="Capture the outcome, handoff, or user-visible resolution."
                        rows={2}
                        value={draftCloseReason}
                      />
                    </label>
                    <button
                      className="btn-danger"
                      disabled={activeSessionId === item.impersonationSessionId}
                      onClick={() => void handleEndSession(item)}
                      type="button"
                    >
                      {activeSessionId === item.impersonationSessionId ? 'Ending session…' : 'End session'}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="list-muted">No access sessions recorded for this environment yet.</p>
      )}
    </>
  );
}
