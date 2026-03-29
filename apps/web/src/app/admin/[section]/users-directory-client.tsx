'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  type AdminUserMutationResult,
  type SupportImpersonationResult,
  systemRoles,
  workspaceRoles,
} from '@quizmind/contracts';

import { type AdminUsersSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

type DirectoryUser = AdminUsersSnapshot['items'][number];
type WorkspaceOption = {
  id: string;
  name: string;
  role: string;
};

interface UsersDirectoryClientProps {
  canManageUserAccess: boolean;
  canStartSupportSessions: boolean;
  currentUserId: string;
  isConnectedSession: boolean;
  items: DirectoryUser[];
  workspaceOptions: WorkspaceOption[];
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

function describePrimaryWorkspace(user: DirectoryUser) {
  const workspace = user.workspaces[0];

  if (!workspace) {
    return null;
  }

  return `${workspace.workspaceName} (${workspace.role})`;
}

function buildWorkspaceDraft(
  user: DirectoryUser,
  workspaceOptions: WorkspaceOption[],
): Record<string, string> {
  const draft: Record<string, string> = {};

  for (const workspace of workspaceOptions) {
    draft[workspace.id] =
      user.workspaces.find((entry) => entry.workspaceId === workspace.id)?.role ?? '';
  }

  for (const workspace of user.workspaces) {
    if (!(workspace.workspaceId in draft)) {
      draft[workspace.workspaceId] = workspace.role;
    }
  }

  return draft;
}

function buildWorkspaceAssignments(workspaceRoleDraft: Record<string, string>) {
  return Object.entries(workspaceRoleDraft)
    .filter(([, role]) => workspaceRoles.includes(role as (typeof workspaceRoles)[number]))
    .map(([workspaceId, role]) => ({
      workspaceId,
      role: role as (typeof workspaceRoles)[number],
    }));
}

function buildRoleDraft(items: DirectoryUser[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.systemRoles]));
}

function buildWorkspaceRoleDraft(items: DirectoryUser[], workspaceOptions: WorkspaceOption[]) {
  return Object.fromEntries(
    items.map((item) => [item.id, buildWorkspaceDraft(item, workspaceOptions)]),
  );
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
  workspaceOptions,
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
  const [draftWorkspaceRoles, setDraftWorkspaceRoles] = useState<Record<string, Record<string, string>>>(
    () => buildWorkspaceRoleDraft(items, workspaceOptions),
  );
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
  const [createWorkspaceRoles, setCreateWorkspaceRoles] = useState<Record<string, string>>({});
  const [createEmailVerified, setCreateEmailVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? canManageUserAccess
        ? 'Create users, assign admin roles, and adjust workspace rights directly from this directory.'
        : canStartSupportSessions
          ? 'This connected session can start support sessions, but cannot change user access rights.'
          : 'This connected session can read users only.'
      : 'Persona preview is read-only. Sign in with a connected admin account to manage access.',
  );
  const [lastStartedSession, setLastStartedSession] = useState<SupportImpersonationResult | null>(null);
  const [lastStartedUser, setLastStartedUser] = useState<DirectoryUser | null>(null);
  const [, startRefresh] = useTransition();

  const workspaceLabelById = useMemo(
    () =>
      new Map<string, string>(
        workspaceOptions.map((workspace) => [workspace.id, `${workspace.name} (${workspace.role})`]),
      ),
    [workspaceOptions],
  );

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

  function getSystemRoleDraft(user: DirectoryUser) {
    return draftSystemRoles[user.id] ?? user.systemRoles;
  }

  function getWorkspaceRoleDraft(user: DirectoryUser) {
    return draftWorkspaceRoles[user.id] ?? buildWorkspaceDraft(user, workspaceOptions);
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
    setDraftWorkspaceRoles((current) => ({
      ...current,
      [user.id]: buildWorkspaceDraft(user, workspaceOptions),
    }));
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
    const primaryWorkspace = user.workspaces[0];
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
    const workspaceMemberships = buildWorkspaceAssignments(createWorkspaceRoles);

    if (!email || !password) {
      setErrorMessage('Email and password are required to create a user.');
      setStatusMessage(null);
      return;
    }

    setCreatingUser(true);
    setErrorMessage(null);
    setStatusMessage(`Creating user ${email}...`);

    try {
      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          ...(displayName ? { displayName } : {}),
          systemRoles: createRoles,
          workspaceMemberships,
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
      setCreateWorkspaceRoles({});
      setCreateEmailVerified(false);
      setCreatingUser(false);
      setStatusMessage(`User ${nextUser.email} created and access assignments were saved.`);
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
    const workspaceRoleDraft = getWorkspaceRoleDraft(user);
    const workspaceMemberships = buildWorkspaceAssignments(workspaceRoleDraft);
    const suspend = getSuspendedDraft(user);
    const suspendReason = getSuspendReasonDraft(user).trim();

    setActiveAccessUserId(user.id);
    setErrorMessage(null);
    setStatusMessage(`Saving access profile for ${user.displayName || user.email}...`);

    try {
      const response = await fetch('/api/admin/users/update-access', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          displayName: displayName || null,
          systemRoles: systemRoleDraft,
          workspaceMemberships,
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
    <div className="admin-directory-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      {isConnectedSession && canManageUserAccess ? (
        <div className="admin-directory-result">
          <span className="micro-label">Create user or admin</span>
          <label className="admin-ticket-field">
            <span className="micro-label">Email</span>
            <input
              disabled={creatingUser}
              onChange={(event) => setCreateEmail(event.target.value)}
              placeholder="new.user@quizmind.dev"
              type="email"
              value={createEmail}
            />
          </label>
          <label className="admin-ticket-field">
            <span className="micro-label">Password</span>
            <input
              disabled={creatingUser}
              onChange={(event) => setCreatePassword(event.target.value)}
              placeholder="At least 8 characters"
              type="password"
              value={createPassword}
            />
          </label>
          <label className="admin-ticket-field">
            <span className="micro-label">Display name</span>
            <input
              disabled={creatingUser}
              onChange={(event) => setCreateDisplayName(event.target.value)}
              placeholder="Optional display name"
              type="text"
              value={createDisplayName}
            />
          </label>
          <label className="admin-ticket-field">
            <span className="micro-label">Initial system roles</span>
            <div className="tag-row">
              {systemRoles.map((role) => (
                <label className="tag" key={`create-role-${role}`}>
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
          {workspaceOptions.length > 0 ? (
            <div className="list-stack">
              {workspaceOptions.map((workspace) => (
                <label className="admin-ticket-field" key={`create-workspace-${workspace.id}`}>
                  <span className="micro-label">{workspace.name}</span>
                  <select
                    disabled={creatingUser}
                    onChange={(event) =>
                      setCreateWorkspaceRoles((current) => ({
                        ...current,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    value={createWorkspaceRoles[workspace.id] ?? ''}
                  >
                    <option value="">No access</option>
                    {workspaceRoles.map((role) => (
                      <option key={`${workspace.id}:${role}`} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
          <label className="tag">
            <input
              checked={createEmailVerified}
              disabled={creatingUser}
              onChange={(event) => setCreateEmailVerified(event.target.checked)}
              type="checkbox"
            />
            mark email as verified
          </label>
          <div className="admin-user-actions">
            <button className="btn-primary" disabled={creatingUser} onClick={() => void handleCreateUser()} type="button">
              {creatingUser ? 'Creating user...' : 'Create user'}
            </button>
          </div>
        </div>
      ) : null}

      {lastStartedSession && lastStartedUser ? (
        <div className="admin-directory-result">
          <span className="micro-label">Latest support session</span>
          <strong>{lastStartedUser.displayName || lastStartedUser.email}</strong>
          <p>
            Session <span className="monospace">{lastStartedSession.impersonationSessionId}</span> started at{' '}
            {formatUtcDateTime(lastStartedSession.createdAt)}.
          </p>
          <div className="admin-user-actions">
            <Link className="btn-ghost" href="/admin/support">
              Open support history
            </Link>
          </div>
        </div>
      ) : null}

      {directoryItems.length > 0 ? (
        <div className="list-stack">
          {directoryItems.map((user) => {
            const primaryWorkspace = describePrimaryWorkspace(user);
            const canStartForUser =
              isConnectedSession &&
              canStartSupportSessions &&
              user.id !== currentUserId &&
              !user.suspendedAt;
            const canManageUser = isConnectedSession && canManageUserAccess;
            const roleDraft = getSystemRoleDraft(user);
            const workspaceRoleDraft = getWorkspaceRoleDraft(user);
            const workspaceScope = Array.from(
              new Set([...workspaceOptions.map((workspace) => workspace.id), ...Object.keys(workspaceRoleDraft)]),
            );

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
                    ? user.workspaces
                        .map((workspace) => `${workspace.workspaceName} (${workspace.role})`)
                        .join(', ')
                    : 'none'}
                </span>
                {primaryWorkspace ? (
                  <span className="list-muted">default support scope: {primaryWorkspace}</span>
                ) : (
                  <span className="list-muted">
                    default support scope: user-level session without workspace.
                  </span>
                )}

                {canManageUser ? (
                  <div className="admin-ticket-editor">
                    <label className="admin-ticket-field">
                      <span className="micro-label">Display name</span>
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
                    <label className="admin-ticket-field">
                      <span className="micro-label">System roles</span>
                      <div className="tag-row">
                        {systemRoles.map((role) => (
                          <label className="tag" key={`${user.id}:role:${role}`}>
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
                    {workspaceScope.length > 0 ? (
                      <div className="list-stack">
                        {workspaceScope.map((workspaceId) => (
                          <label className="admin-ticket-field" key={`${user.id}:workspace:${workspaceId}`}>
                            <span className="micro-label">
                              {workspaceLabelById.get(workspaceId) ?? workspaceId}
                            </span>
                            <select
                              disabled={activeAccessUserId === user.id}
                              onChange={(event) =>
                                setDraftWorkspaceRoles((current) => ({
                                  ...current,
                                  [user.id]: {
                                    ...(current[user.id] ?? {}),
                                    [workspaceId]: event.target.value,
                                  },
                                }))
                              }
                              value={workspaceRoleDraft[workspaceId] ?? ''}
                            >
                              <option value="">No access</option>
                              {workspaceRoles.map((role) => (
                                <option key={`${user.id}:${workspaceId}:${role}`} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    <label className="tag">
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
                      <label className="admin-ticket-field">
                        <span className="micro-label">Suspend reason</span>
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
                    <div className="admin-user-actions">
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
                  <div className="admin-ticket-editor">
                    <label className="admin-ticket-field">
                      <span className="micro-label">Session reason</span>
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
                    <label className="admin-ticket-field">
                      <span className="micro-label">Operator note</span>
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
                    <div className="admin-user-actions">
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
        <p>No users are available in the directory for this environment.</p>
      )}
    </div>
  );
}
