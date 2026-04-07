'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  type AdminUserMutationResult,
  type SupportImpersonationResult,
  systemRoles,
} from '@quizmind/contracts';

import { type AdminUsersSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

type DirectoryUser = AdminUsersSnapshot['items'][number];

interface UsersDirectoryClientProps {
  canManageUserAccess: boolean;
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

interface AdminUserMutationRouteResponse {
  ok: boolean;
  data?: AdminUserMutationResult;
  error?: {
    message?: string;
  };
}

function buildRoleDraft(items: DirectoryUser[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.systemRoles]));
}

function buildDisplayNameDraft(items: DirectoryUser[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.displayName ?? '']));
}

function buildSuspendDraft(items: DirectoryUser[]) {
  return Object.fromEntries(items.map((item) => [item.id, Boolean(item.suspendedAt)]));
}

function buildSuspendReasonDraft(items: DirectoryUser[]) {
  return Object.fromEntries(items.map((item) => [item.id, '']));
}

function applyMutation(items: DirectoryUser[], nextUser: DirectoryUser) {
  const nextItems = items.filter((item) => item.id !== nextUser.id);
  nextItems.push(nextUser);

  return nextItems.sort((left, right) => left.email.localeCompare(right.email));
}

export function UsersDirectoryClient({
  canManageUserAccess,
  canStartSupportSessions,
  currentUserId,
  isConnectedSession,
  items,
}: UsersDirectoryClientProps) {
  const router = useRouter();
  const [directoryItems, setDirectoryItems] = useState<DirectoryUser[]>(items);
  const [activeSupportUserId, setActiveSupportUserId] = useState<string | null>(null);
  const [activeAccessUserId, setActiveAccessUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [draftReasons, setDraftReasons] = useState<Record<string, string>>({});
  const [draftOperatorNotes, setDraftOperatorNotes] = useState<Record<string, string>>({});
  const [draftSystemRoles, setDraftSystemRoles] =
    useState<Record<string, string[]>>(() => buildRoleDraft(items));
  const [draftDisplayNames, setDraftDisplayNames] = useState<Record<string, string>>(
    () => buildDisplayNameDraft(items),
  );
  const [draftSuspended, setDraftSuspended] = useState<Record<string, boolean>>(
    () => buildSuspendDraft(items),
  );
  const [draftSuspendReasons, setDraftSuspendReasons] = useState<Record<string, string>>(
    () => buildSuspendReasonDraft(items),
  );
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createRoles, setCreateRoles] = useState<string[]>([]);
  const [createEmailVerified, setCreateEmailVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? canManageUserAccess
        ? 'Create users, assign admin roles, and manage account access directly from this directory.'
        : canStartSupportSessions
          ? 'This connected session can start support sessions, but cannot change user access rights.'
          : 'This connected session can read users only.'
      : 'Persona preview is read-only. Sign in with a connected admin account to manage access.',
  );
  const [lastStartedSession, setLastStartedSession] = useState<SupportImpersonationResult | null>(null);
  const [lastStartedUser, setLastStartedUser] = useState<DirectoryUser | null>(null);
  const [, startRefresh] = useTransition();

  function buildDefaultReason(user: DirectoryUser) {
    return `Support follow-up from /admin/users for ${user.email}.`;
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

  function getSystemRoleDraft(user: DirectoryUser) {
    return draftSystemRoles[user.id] ?? user.systemRoles;
  }

  function getDisplayNameDraft(user: DirectoryUser) {
    return draftDisplayNames[user.id] ?? user.displayName ?? '';
  }

  function getSuspendedDraft(user: DirectoryUser) {
    return draftSuspended[user.id] ?? Boolean(user.suspendedAt);
  }

  function getSuspendReasonDraft(user: DirectoryUser) {
    return draftSuspendReasons[user.id] ?? '';
  }

  function resetDraftsForUser(user: DirectoryUser) {
    setDraftSystemRoles((current) => ({ ...current, [user.id]: user.systemRoles }));
    setDraftDisplayNames((current) => ({ ...current, [user.id]: user.displayName ?? '' }));
    setDraftSuspended((current) => ({ ...current, [user.id]: Boolean(user.suspendedAt) }));
    setDraftSuspendReasons((current) => ({ ...current, [user.id]: '' }));
  }

  function toggleRoleForUser(userId: string, role: (typeof systemRoles)[number], checked: boolean) {
    setDraftSystemRoles((current) => {
      const previous = current[userId] ?? [];
      const next = checked
        ? Array.from(new Set([...previous, role]))
        : previous.filter((item) => item !== role);

      return {
        ...current,
        [userId]: next,
      };
    });
  }

  function toggleCreateRole(role: (typeof systemRoles)[number], checked: boolean) {
    setCreateRoles((current) =>
      checked ? Array.from(new Set([...current, role])) : current.filter((item) => item !== role),
    );
  }

  async function handleStartSupportSession(user: DirectoryUser) {
    const reason = getDraftReason(user).trim();
    const operatorNote = getDraftOperatorNote(user).trim() || undefined;

    if (!reason) {
      setErrorMessage('Support session reason is required before launch.');
      setStatusMessage(null);
      return;
    }

    setActiveSupportUserId(user.id);
    setErrorMessage(null);
    setLastStartedSession(null);
    setLastStartedUser(null);
    setStatusMessage(`Starting a support session for ${user.displayName || user.email}...`);

    try {
      const response = await fetch('/bff/support/impersonation', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: user.id,
          reason,
          ...(operatorNote ? { operatorNote } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as SupportImpersonationRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveSupportUserId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to start the support session right now.');
        return;
      }

      setActiveSupportUserId(null);
      setLastStartedSession(payload.data);
      setLastStartedUser(user);
      setStatusMessage(`Support session started for ${user.displayName || user.email}. Refreshing admin data...`);

      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setActiveSupportUserId(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the support session route right now.');
    }
  }

  async function handleCreateUser() {
    if (!isConnectedSession || !canManageUserAccess) {
      setErrorMessage('This session cannot create users.');
      setStatusMessage(null);
      return;
    }

    const email = createEmail.trim();
    const password = createPassword.trim();
    const displayName = createDisplayName.trim();

    if (!email || !password) {
      setErrorMessage('Email and password are required to create a user.');
      setStatusMessage(null);
      return;
    }

    setCreatingUser(true);
    setErrorMessage(null);
    setStatusMessage(`Creating user ${email}...`);

    try {
      const response = await fetch('/bff/admin/users/create', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          ...(displayName ? { displayName } : {}),
          systemRoles: createRoles,
          emailVerified: createEmailVerified,
        }),
      });
      const payload = (await response.json().catch(() => null)) as AdminUserMutationRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setCreatingUser(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to create user right now.');
        return;
      }

      const nextUser = payload.data.user;

      setDirectoryItems((current) => applyMutation(current, nextUser));
      resetDraftsForUser(nextUser);
      setCreateEmail('');
      setCreatePassword('');
      setCreateDisplayName('');
      setCreateRoles([]);
      setCreateEmailVerified(false);
      setCreatingUser(false);
      setStatusMessage(`User ${nextUser.email} created.`);
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setCreatingUser(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the create-user route right now.');
    }
  }

  async function handleUpdateUserAccess(user: DirectoryUser) {
    if (!isConnectedSession || !canManageUserAccess) {
      setErrorMessage('This session cannot update user access.');
      setStatusMessage(null);
      return;
    }

    const displayName = getDisplayNameDraft(user).trim();
    const systemRoleDraft = getSystemRoleDraft(user);
    const suspend = getSuspendedDraft(user);
    const suspendReason = getSuspendReasonDraft(user).trim();

    setActiveAccessUserId(user.id);
    setErrorMessage(null);
    setStatusMessage(`Saving access profile for ${user.displayName || user.email}...`);

    try {
      const response = await fetch('/bff/admin/users/update-access', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          displayName: displayName || null,
          systemRoles: systemRoleDraft,
          suspend,
          ...(suspend ? { suspendReason: suspendReason || null } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as AdminUserMutationRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setActiveAccessUserId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to update user access right now.');
        return;
      }

      const nextUser = payload.data.user;
      setDirectoryItems((current) => applyMutation(current, nextUser));
      resetDraftsForUser(nextUser);
      setActiveAccessUserId(null);
      setStatusMessage(`Access profile updated for ${nextUser.displayName || nextUser.email}.`);
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setActiveAccessUserId(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the user-access update route right now.');
    }
  }

  return (
    <>
      {statusMessage ? <div className="banner banner-info">{statusMessage}</div> : null}
      {errorMessage ? <div className="banner banner-error">{errorMessage}</div> : null}

      {isConnectedSession && canManageUserAccess ? (
        <section className="panel" style={{ marginBottom: '16px' }}>
          <span className="micro-label">Create user or admin</span>
          <h2>Provision a new account</h2>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-field__label">Email</span>
              <input
                disabled={creatingUser}
                onChange={(event) => setCreateEmail(event.target.value)}
                placeholder="new.user@quizmind.dev"
                type="email"
                value={createEmail}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">Password</span>
              <input
                disabled={creatingUser}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="At least 8 characters"
                type="password"
                value={createPassword}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">Display name</span>
              <input
                disabled={creatingUser}
                onChange={(event) => setCreateDisplayName(event.target.value)}
                placeholder="Optional display name"
                type="text"
                value={createDisplayName}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">System roles</span>
              <div className="tag-row">
                {systemRoles.map((role) => (
                  <label className="tag-soft tag-soft--gray" key={`create-role-${role}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <input
                      checked={createRoles.includes(role)}
                      disabled={creatingUser}
                      onChange={(event) => toggleCreateRole(role, event.target.checked)}
                      type="checkbox"
                    />
                    {role}
                  </label>
                ))}
              </div>
            </label>
          </div>
          <p className="list-muted" style={{ fontSize: '0.82rem', margin: '4px 0 12px' }}>
            User account: no system roles. Admin account: at least one system role (e.g.{' '}
            <span className="monospace">platform_admin</span>).
          </p>
          <label className="tag-soft tag-soft--gray" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
            <input
              checked={createEmailVerified}
              disabled={creatingUser}
              onChange={(event) => setCreateEmailVerified(event.target.checked)}
              type="checkbox"
            />
            mark email as verified
          </label>
          <div className="link-row">
            <button className="btn-primary" disabled={creatingUser} onClick={() => void handleCreateUser()} type="button">
              {creatingUser ? 'Creating user...' : 'Create user'}
            </button>
          </div>
        </section>
      ) : null}

      {lastStartedSession && lastStartedUser ? (
        <div className="connect-success" style={{ marginBottom: '16px' }}>
          <span className="micro-label">Support session started</span>
          <p><strong>{lastStartedUser.displayName || lastStartedUser.email}</strong></p>
          <p className="list-muted">
            Session <span className="monospace">{lastStartedSession.impersonationSessionId}</span> opened at{' '}
            {formatUtcDateTime(lastStartedSession.createdAt)}.
          </p>
          <div className="link-row" style={{ marginTop: '8px' }}>
            <Link className="btn-ghost" href="/admin/support">
              Open support history
            </Link>
          </div>
        </div>
      ) : null}

      {directoryItems.length > 0 ? (
        <div style={{ display: 'grid', gap: '12px' }}>
          {directoryItems.map((user) => {
            const canStartForUser =
              isConnectedSession &&
              canStartSupportSessions &&
              user.id !== currentUserId &&
              !user.suspendedAt;
            const canManageUser = isConnectedSession && canManageUserAccess;
            const roleDraft = getSystemRoleDraft(user);

            return (
              <div className="panel" style={{ padding: '16px 20px' }} key={user.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                      {user.displayName || user.email}
                    </p>
                    {user.displayName ? (
                      <p className="list-muted" style={{ margin: '2px 0 0', fontSize: '0.84rem' }}>{user.email}</p>
                    ) : null}
                  </div>
                  <div className="tag-row">
                    <span className={user.emailVerifiedAt ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
                      {user.emailVerifiedAt ? 'email verified' : 'email pending'}
                    </span>
                    {user.suspendedAt ? <span className="tag-soft tag-soft--orange">suspended</span> : null}
                    {user.id === currentUserId ? <span className="tag-soft tag-soft--gray">current session</span> : null}
                    {!user.lastLoginAt ? <span className="tag-soft tag-soft--gray">no login recorded</span> : null}
                  </div>
                </div>
                <div className="kv-list">
                  <div className="kv-row">
                    <span className="kv-row__key">Roles</span>
                    <span className="kv-row__value">{user.systemRoles.length > 0 ? user.systemRoles.join(', ') : 'no system roles'}</span>
                  </div>
                </div>

                {canManageUser ? (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(31,41,51,0.07)' }}>
                    <span className="micro-label">Access profile</span>
                    <div className="form-grid" style={{ marginTop: '8px' }}>
                      <label className="form-field">
                        <span className="form-field__label">Display name</span>
                        <input
                          disabled={activeAccessUserId === user.id}
                          onChange={(event) =>
                            setDraftDisplayNames((current) => ({
                              ...current,
                              [user.id]: event.target.value,
                            }))
                          }
                          placeholder="Display name"
                          type="text"
                          value={getDisplayNameDraft(user)}
                        />
                      </label>
                      <label className="form-field">
                        <span className="form-field__label">System roles</span>
                        <div className="tag-row">
                          {systemRoles.map((role) => (
                            <label className="tag-soft tag-soft--gray" key={`${user.id}:role:${role}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <input
                                checked={roleDraft.includes(role)}
                                disabled={activeAccessUserId === user.id}
                                onChange={(event) => toggleRoleForUser(user.id, role, event.target.checked)}
                                type="checkbox"
                              />
                              {role}
                            </label>
                          ))}
                        </div>
                      </label>
                    </div>
                    <label className="tag-soft tag-soft--gray" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '8px 0' }}>
                      <input
                        checked={getSuspendedDraft(user)}
                        disabled={activeAccessUserId === user.id || user.id === currentUserId}
                        onChange={(event) =>
                          setDraftSuspended((current) => ({
                            ...current,
                            [user.id]: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      suspend account
                    </label>
                    {getSuspendedDraft(user) ? (
                      <label className="form-field" style={{ marginTop: '6px' }}>
                        <span className="form-field__label">Suspend reason</span>
                        <textarea
                          disabled={activeAccessUserId === user.id}
                          onChange={(event) =>
                            setDraftSuspendReasons((current) => ({
                              ...current,
                              [user.id]: event.target.value,
                            }))
                          }
                          placeholder="Why this account is suspended."
                          rows={2}
                          value={getSuspendReasonDraft(user)}
                        />
                      </label>
                    ) : null}
                    <div className="link-row" style={{ marginTop: '10px' }}>
                      <button
                        className="btn-primary"
                        disabled={activeAccessUserId === user.id}
                        onClick={() => void handleUpdateUserAccess(user)}
                        type="button"
                      >
                        {activeAccessUserId === user.id ? 'Saving access...' : 'Save access'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {canStartForUser ? (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(31,41,51,0.07)' }}>
                    <span className="micro-label">Support session</span>
                    <div className="form-grid" style={{ marginTop: '8px' }}>
                      <label className="form-field">
                        <span className="form-field__label">Session reason</span>
                        <textarea
                          disabled={activeSupportUserId === user.id}
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
                      <label className="form-field">
                        <span className="form-field__label">Operator note</span>
                        <textarea
                          disabled={activeSupportUserId === user.id}
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
                    </div>
                    <div className="link-row" style={{ marginTop: '10px' }}>
                      <button
                        className="btn-primary"
                        disabled={activeSupportUserId === user.id}
                        onClick={() => void handleStartSupportSession(user)}
                        type="button"
                      >
                        {activeSupportUserId === user.id
                          ? 'Starting support session...'
                          : 'Start support session'}
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
        <div className="empty-state">
          <span className="micro-label">No users</span>
          <h2>No users are available in the directory for this environment</h2>
        </div>
      )}
    </>
  );
}
