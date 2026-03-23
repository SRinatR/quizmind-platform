'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { type SupportImpersonationResult } from '@quizmind/contracts';

import { type AdminUsersSnapshot } from '../../../lib/api';

type DirectoryUser = AdminUsersSnapshot['items'][number];

interface UsersDirectoryClientProps {
  canStartSupportSessions: boolean;
  currentUserId: string;
  isConnectedSession: boolean;
  items: DirectoryUser[];
}

interface SupportImpersonationRouteResponse {
  ok: boolean;
  data?: SupportImpersonationResult;
  error?: {
    message?: string;
  };
}

function describePrimaryWorkspace(user: DirectoryUser) {
  const workspace = user.workspaces[0];

  if (!workspace) {
    return null;
  }

  return `${workspace.workspaceName} (${workspace.role})`;
}

export function UsersDirectoryClient({
  canStartSupportSessions,
  currentUserId,
  isConnectedSession,
  items,
}: UsersDirectoryClientProps) {
  const router = useRouter();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [draftReasons, setDraftReasons] = useState<Record<string, string>>({});
  const [draftOperatorNotes, setDraftOperatorNotes] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? canStartSupportSessions
        ? 'Start a support session from any user row and tailor the launch reason plus operator context before it is persisted.'
        : 'This connected session can read the directory but cannot start support sessions.'
      : 'Persona preview is read-only. Sign in with a connected support-capable account to start support sessions.',
  );
  const [lastStartedSession, setLastStartedSession] = useState<SupportImpersonationResult | null>(null);
  const [lastStartedUser, setLastStartedUser] = useState<DirectoryUser | null>(null);
  const [, startRefresh] = useTransition();

  function buildDefaultReason(user: DirectoryUser) {
    const primaryWorkspace = user.workspaces[0];

    return primaryWorkspace
      ? `Support follow-up from /admin/users for ${user.email} in ${primaryWorkspace.workspaceName}.`
      : `Support follow-up from /admin/users for ${user.email}.`;
  }

  function getDraftReason(user: DirectoryUser) {
    return draftReasons[user.id] ?? buildDefaultReason(user);
  }

  function getDraftOperatorNote(user: DirectoryUser) {
    return (
      draftOperatorNotes[user.id] ??
      'Started from the admin user directory without a linked support ticket.'
    );
  }

  async function handleStartSupportSession(user: DirectoryUser) {
    const primaryWorkspace = user.workspaces[0];
    const reason = getDraftReason(user).trim();
    const operatorNote = getDraftOperatorNote(user).trim() || undefined;

    if (!reason) {
      setErrorMessage('Support session reason is required before launch.');
      setStatusMessage(null);
      return;
    }

    setActiveUserId(user.id);
    setErrorMessage(null);
    setLastStartedSession(null);
    setLastStartedUser(null);
    setStatusMessage(`Starting a support session for ${user.displayName || user.email}...`);

    try {
      const response = await fetch('/api/support/impersonation', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: user.id,
          reason,
          ...(operatorNote ? { operatorNote } : {}),
          ...(primaryWorkspace ? { workspaceId: primaryWorkspace.workspaceId } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as SupportImpersonationRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveUserId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to start the support session right now.');
        return;
      }

      setActiveUserId(null);
      setLastStartedSession(payload.data);
      setLastStartedUser(user);
      setStatusMessage(`Support session started for ${user.displayName || user.email}. Refreshing admin data...`);

      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setActiveUserId(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the support session route right now.');
    }
  }

  return (
    <div className="admin-directory-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      {lastStartedSession && lastStartedUser ? (
        <div className="admin-directory-result">
          <span className="micro-label">Latest support session</span>
          <strong>{lastStartedUser.displayName || lastStartedUser.email}</strong>
          <p>
            Session <span className="monospace">{lastStartedSession.impersonationSessionId}</span> started at{' '}
            {new Date(lastStartedSession.createdAt).toLocaleString()}.
          </p>
          <div className="admin-user-actions">
            <Link className="btn-ghost" href="/admin/support">
              Open support history
            </Link>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="list-stack">
          {items.map((user) => {
            const primaryWorkspace = describePrimaryWorkspace(user);
            const canStartForUser =
              isConnectedSession && canStartSupportSessions && user.id !== currentUserId && !user.suspendedAt;

            return (
              <div className="list-item" key={user.id}>
                <strong>{user.displayName || user.email}</strong>
                <p>{user.email}</p>
                <div className="tag-row">
                  <span className={user.emailVerifiedAt ? 'tag' : 'tag warn'}>
                    {user.emailVerifiedAt ? 'email verified' : 'email pending'}
                  </span>
                  <span className={user.lastLoginAt ? 'tag' : 'tag warn'}>
                    {user.lastLoginAt ? 'active session history' : 'no login recorded'}
                  </span>
                  {user.suspendedAt ? <span className="tag warn">suspended</span> : null}
                  {user.id === currentUserId ? <span className="tag">current session</span> : null}
                </div>
                <span className="list-muted">
                  roles: {user.systemRoles.length > 0 ? user.systemRoles.join(', ') : 'workspace-only'}
                </span>
                <span className="list-muted">
                  workspaces:{' '}
                  {user.workspaces.length > 0
                    ? user.workspaces.map((workspace) => `${workspace.workspaceName} (${workspace.role})`).join(', ')
                    : 'none'}
                </span>
                {primaryWorkspace ? (
                  <span className="list-muted">default support scope: {primaryWorkspace}</span>
                ) : (
                  <span className="list-muted">default support scope: user-level session without workspace.</span>
                )}
                {canStartForUser ? (
                  <div className="admin-ticket-editor">
                    <label className="admin-ticket-field">
                      <span className="micro-label">Session reason</span>
                      <textarea
                        disabled={activeUserId === user.id}
                        onChange={(event) => {
                          setDraftReasons((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }));
                        }}
                        placeholder="Explain why this support session is being opened."
                        rows={3}
                        value={getDraftReason(user)}
                      />
                    </label>
                    <label className="admin-ticket-field">
                      <span className="micro-label">Operator note</span>
                      <textarea
                        disabled={activeUserId === user.id}
                        onChange={(event) => {
                          setDraftOperatorNotes((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }));
                        }}
                        placeholder="Capture support context that should stay with the session history."
                        rows={3}
                        value={getDraftOperatorNote(user)}
                      />
                    </label>
                    <div className="admin-user-actions">
                      <button
                        className="btn-primary"
                        disabled={activeUserId === user.id}
                        onClick={() => void handleStartSupportSession(user)}
                        type="button"
                      >
                        {activeUserId === user.id ? 'Starting support session...' : 'Start support session'}
                      </button>
                      <Link className="btn-ghost" href="/admin/support">
                        View support history
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p>No users are available in the directory for this environment.</p>
      )}
    </div>
  );
}
