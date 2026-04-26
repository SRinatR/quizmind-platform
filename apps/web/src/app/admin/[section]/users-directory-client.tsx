'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, useCallback, useRef, useEffect } from 'react';
import { type AdminUserMutationResult } from '@quizmind/contracts';
import { type AdminUsersSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';
import { usePreferences } from '../../../lib/preferences';

const ADMIN_ROLE = 'admin';

type DirectoryUser = AdminUsersSnapshot['items'][number];

interface UsersDirectoryClientProps {
  canManageUserAccess: boolean;
  currentUserId: string;
  isConnectedSession: boolean;
  items: DirectoryUser[];
  total: number;
  page: number;
  limit: number;
}

interface MutationRouteResponse {
  ok: boolean;
  data?: AdminUserMutationResult;
  error?: { message?: string };
}

interface DeleteRouteResponse {
  ok: boolean;
  data?: { userId: string };
  error?: { message?: string };
}

function isAdmin(user: DirectoryUser) {
  return user.systemRoles.length > 0;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return formatUtcDateTime(iso);
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarProps {
  query: string;
  role: string;
  banned: string;
  verified: string;
  sort: string;
  limit: number;
  isFiltered: boolean;
  canManage: boolean;
  onQueryChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onBannedChange: (v: string) => void;
  onVerifiedChange: (v: string) => void;
  onSortChange: (v: string) => void;
  onLimitChange: (v: number) => void;
  onApply: () => void;
  onReset: () => void;
  onCreateUser: () => void;
}

function Toolbar({
  query,
  role,
  banned,
  verified,
  sort,
  limit,
  isFiltered,
  canManage,
  onQueryChange,
  onRoleChange,
  onBannedChange,
  onVerifiedChange,
  onSortChange,
  onLimitChange,
  onApply,
  onReset,
  onCreateUser,
}: ToolbarProps) {
  const { t } = usePreferences();
  const a = t.admin.users;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 0 12px',
      }}
    >
      <input
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onApply(); }}
        placeholder={a.searchPlaceholder}
        style={{ minWidth: '200px', flex: '1 1 200px', padding: '5px 10px', fontSize: '0.85rem' }}
        type="search"
        value={query}
      />
      <select
        onChange={(e) => onRoleChange(e.target.value)}
        style={{ padding: '5px 8px', fontSize: '0.85rem' }}
        value={role}
      >
        <option value="all">{a.allRoles}</option>
        <option value="admin">{a.admin}</option>
        <option value="user">{a.user}</option>
      </select>
      <select
        onChange={(e) => onBannedChange(e.target.value)}
        style={{ padding: '5px 8px', fontSize: '0.85rem' }}
        value={banned}
      >
        <option value="all">{a.allBanStates}</option>
        <option value="banned">{a.banned}</option>
        <option value="not-banned">{a.notBanned}</option>
      </select>
      <select
        onChange={(e) => onVerifiedChange(e.target.value)}
        style={{ padding: '5px 8px', fontSize: '0.85rem' }}
        value={verified}
      >
        <option value="all">{a.allVerifiedStates}</option>
        <option value="verified">{a.verified}</option>
        <option value="unverified">{a.unverified}</option>
      </select>
      <select
        onChange={(e) => onSortChange(e.target.value)}
        style={{ padding: '5px 8px', fontSize: '0.85rem' }}
        value={sort}
      >
        <option value="created-desc">{a.newestFirst}</option>
        <option value="created-asc">Oldest first</option>
        <option value="login-desc">Recent login</option>
        <option value="email-asc">Email A→Z</option>
      </select>
      <select
        onChange={(e) => onLimitChange(Number(e.target.value))}
        style={{ padding: '5px 8px', fontSize: '0.85rem' }}
        value={limit}
      >
        <option value={25}>25 {a.perPage}</option>
        <option value={50}>50 {a.perPage}</option>
        <option value={100}>100 {a.perPage}</option>
      </select>
      <button className="btn-ghost" onClick={onApply} style={{ fontSize: '0.85rem', padding: '5px 12px' }} type="button">
        {a.search}
      </button>
      {isFiltered ? (
        <button className="btn-ghost" onClick={onReset} style={{ fontSize: '0.85rem', padding: '5px 12px' }} type="button">
          Reset
        </button>
      ) : null}
      {canManage ? (
        <button className="btn-primary" onClick={onCreateUser} style={{ fontSize: '0.85rem', padding: '5px 12px', marginLeft: 'auto' }} type="button">
          + {a.createUser}
        </button>
      ) : null}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPage: (p: number) => void;
}

function Pagination({ page, limit, total, onPage }: PaginationProps) {
  const { t } = usePreferences();
  const a = t.admin.users;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = Math.min(total, (page - 1) * limit + 1);
  const to = Math.min(total, page * limit);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0 4px', fontSize: '0.82rem', color: 'var(--muted)' }}>
      <span>{from}–{to} of {total}</span>
      <button
        className="btn-ghost"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        style={{ fontSize: '0.8rem', padding: '3px 10px' }}
        type="button"
      >
        Prev
      </button>
      <span style={{ minWidth: '60px', textAlign: 'center' }}>
        {page} / {totalPages}
      </span>
      <button
        className="btn-ghost"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        style={{ fontSize: '0.8rem', padding: '3px 10px' }}
        type="button"
      >
        Next
      </button>
    </div>
  );
}

// ── User drawer ───────────────────────────────────────────────────────────────

interface UserDrawerProps {
  user: DirectoryUser;
  canManage: boolean;
  isSelf: boolean;
  busy: boolean;
  onClose: () => void;
  onToggleAdmin: (u: DirectoryUser) => void;
  onToggleBan: (u: DirectoryUser) => void;
  onDelete: (u: DirectoryUser) => void;
}

function UserDrawer({ user, canManage, isSelf, busy, onClose, onToggleAdmin, onToggleBan, onDelete }: UserDrawerProps) {
  const { t } = usePreferences();
  const a = t.admin.users;
  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 40,
        }}
      />
      {/* panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '360px', maxWidth: '100vw',
          background: 'var(--surface, #fff)', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          zIndex: 50, overflowY: 'auto', padding: '24px 20px',
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span className="micro-label">{a.user}</span>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: '0.82rem', padding: '3px 10px' }} type="button">{t.common.close}</button>
        </div>

        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>{user.displayName ?? user.email}</p>
          {user.displayName ? <p className="list-muted" style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>{user.email}</p> : null}
          <p className="list-muted" style={{ margin: '4px 0 0', fontSize: '0.76rem', fontFamily: 'monospace' }}>{user.id}</p>
        </div>

        <div className="tag-row" style={{ margin: 0 }}>
          <span className={user.emailVerifiedAt ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
            {user.emailVerifiedAt ? a.verified : a.unverified}
          </span>
          {user.suspendedAt ? <span className="tag-soft tag-soft--orange">{a.banned}</span> : <span className="tag-soft tag-soft--gray">{a.notBanned}</span>}
          {isAdmin(user) ? <span className="tag-soft">{a.admin}</span> : <span className="tag-soft tag-soft--gray">{a.user}</span>}
          {isSelf ? <span className="tag-soft tag-soft--gray">you</span> : null}
        </div>

        <table style={{ fontSize: '0.82rem', borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr><td style={{ padding: '3px 0', color: 'var(--muted)', width: '100px' }}>{a.created}</td><td>{formatDate(user.createdAt)}</td></tr>
            <tr><td style={{ padding: '3px 0', color: 'var(--muted)' }}>{a.lastLogin}</td><td>{formatDate(user.lastLoginAt)}</td></tr>
            {user.suspendedAt ? <tr><td style={{ padding: '3px 0', color: 'var(--muted)' }}>{a.banned}</td><td>{formatDate(user.suspendedAt)}</td></tr> : null}
          </tbody>
        </table>

        {canManage && !isSelf ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid rgba(31,41,51,0.1)' }}>
            <span className="micro-label">{a.actions}</span>
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => onToggleAdmin(user)}
              style={{ fontSize: '0.85rem', textAlign: 'left' }}
              type="button"
            >
              {isAdmin(user) ? a.removeAdmin : a.makeAdmin}
            </button>
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => onToggleBan(user)}
              style={{ fontSize: '0.85rem', textAlign: 'left' }}
              type="button"
            >
              {user.suspendedAt ? a.unban : a.ban}
            </button>
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => onDelete(user)}
              style={{ fontSize: '0.85rem', textAlign: 'left', color: 'var(--destructive, #c0392b)' }}
              type="button"
            >
              {a.delete}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ── Create user modal ─────────────────────────────────────────────────────────

interface CreateUserModalProps {
  busy: boolean;
  onClose: () => void;
  onSubmit: (data: { email: string; password: string; displayName: string; isAdmin: boolean; emailVerified: boolean }) => void;
}

function CreateUserModal({ busy, onClose, onSubmit }: CreateUserModalProps) {
  const { t } = usePreferences();
  const a = t.admin.users;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 60 }}
      />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'var(--surface, #fff)', borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 70,
          width: '420px', maxWidth: '96vw', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>{a.createUser}</h3>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: '0.82rem', padding: '3px 10px' }} type="button">{t.common.cancel}</button>
        </div>
        <label className="form-field">
          <span className="form-field__label">{a.email}</span>
          <input
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            type="email"
            value={email}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">Password</span>
          <input
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            type="password"
            value={password}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">Display name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></span>
          <input
            disabled={busy}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional"
            type="text"
            value={displayName}
          />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input
            checked={makeAdmin}
            disabled={busy}
            onChange={(e) => setMakeAdmin(e.target.checked)}
            type="checkbox"
          />
          {a.admin}
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input
            checked={emailVerified}
            disabled={busy}
            onChange={(e) => setEmailVerified(e.target.checked)}
            type="checkbox"
          />
          {a.verified}
        </label>
        <div className="link-row" style={{ marginTop: '4px' }}>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => onSubmit({ email, password, displayName, isAdmin: makeAdmin, emailVerified })}
            type="button"
          >
            {busy ? t.settings.account.saving : a.createUser}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UsersDirectoryClient({
  canManageUserAccess,
  currentUserId,
  isConnectedSession,
  items: initialItems,
  total: initialTotal,
  page: initialPage,
  limit: initialLimit,
}: UsersDirectoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = usePreferences();
  const a = t.admin.users;
  const [, startTransition] = useTransition();

  // Local optimistic state: overrides applied after mutations until server refresh
  const [localItems, setLocalItems] = useState<DirectoryUser[]>(initialItems);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  // Keep local items in sync when server sends new props (after navigation)
  // We use a key trick: items reference changes on every server render
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (prevInitialItems !== initialItems) {
    setPrevInitialItems(initialItems);
    setLocalItems(initialItems);
    // Close drawer if the selected user is no longer visible
    if (selectedUser) {
      const still = initialItems.find((u) => u.id === selectedUser.id);
      if (still) setSelectedUser(still);
      else setSelectedUser(null);
    }
  }

  // ── Filter state (controlled, applied on Search / Enter / debounce) ─────────
  const [draftQuery, setDraftQuery] = useState(searchParams.get('userQuery') ?? '');
  const [draftRole, setDraftRole] = useState(searchParams.get('userRole') ?? 'all');
  const [draftBanned, setDraftBanned] = useState(searchParams.get('userBanned') ?? 'all');
  const [draftVerified, setDraftVerified] = useState(searchParams.get('userVerified') ?? 'all');
  const [draftSort, setDraftSort] = useState(searchParams.get('userSort') ?? 'created-desc');
  const [draftLimit, setDraftLimit] = useState(initialLimit);

  // Stable refs so debounced callback always reads latest values
  const draftQueryRef = useRef(draftQuery);
  draftQueryRef.current = draftQuery;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Whether any non-default filter is active in the URL (not draft)
  const hasActiveFilters = Boolean(
    searchParams.get('userQuery') ||
    (searchParams.get('userRole') && searchParams.get('userRole') !== 'all') ||
    (searchParams.get('userBanned') && searchParams.get('userBanned') !== 'all') ||
    (searchParams.get('userVerified') && searchParams.get('userVerified') !== 'all') ||
    (searchParams.get('userSort') && searchParams.get('userSort') !== 'created-desc'),
  );

  function buildParams(
    overrides: Record<string, string | number | undefined> = {},
    base?: { query: string; role: string; banned: string; verified: string; sort: string; limit: number },
  ) {
    const q = base?.query ?? draftQuery;
    const r = base?.role ?? draftRole;
    const b = base?.banned ?? draftBanned;
    const v = base?.verified ?? draftVerified;
    const s = base?.sort ?? draftSort;
    const l = base?.limit ?? draftLimit;

    const next = new URLSearchParams(searchParams.toString());
    const apply: Record<string, string | undefined> = {
      userQuery: q || undefined,
      userRole: r !== 'all' ? r : undefined,
      userBanned: b !== 'all' ? b : undefined,
      userVerified: v !== 'all' ? v : undefined,
      userSort: s !== 'created-desc' ? s : undefined,
      userLimit: l !== 25 ? String(l) : undefined,
      userPage: undefined,
      ...Object.fromEntries(Object.entries(overrides).map(([k, val]) => [k, val === undefined ? undefined : String(val)])),
    };
    for (const [k, val] of Object.entries(apply)) {
      if (val === undefined || val === '') {
        next.delete(k);
      } else {
        next.set(k, val);
      }
    }
    return next.toString();
  }

  function applyFilters() {
    const qs = buildParams({ userPage: undefined });
    startTransition(() => {
      router.push(`?${qs}`, { scroll: false });
    });
  }

  function handleQueryChange(v: string) {
    setDraftQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const qs = buildParams({ userPage: undefined }, {
        query: draftQueryRef.current,
        role: draftRole,
        banned: draftBanned,
        verified: draftVerified,
        sort: draftSort,
        limit: draftLimit,
      });
      startTransition(() => {
        router.push(`?${qs}`, { scroll: false });
      });
    }, 400);
  }

  // Clean up debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function resetFilters() {
    setDraftQuery('');
    setDraftRole('all');
    setDraftBanned('all');
    setDraftVerified('all');
    setDraftSort('created-desc');
    setDraftLimit(25);
    const next = new URLSearchParams(searchParams.toString());
    ['userQuery', 'userRole', 'userBanned', 'userVerified', 'userSort', 'userLimit', 'userPage'].forEach((k) => next.delete(k));
    startTransition(() => {
      router.push(`?${next.toString()}`, { scroll: false });
    });
  }

  function goToPage(p: number) {
    const qs = buildParams({ userPage: p > 1 ? String(p) : undefined });
    startTransition(() => {
      router.push(`?${qs}`, { scroll: false });
    });
  }

  function refresh() {
    startTransition(() => { router.refresh(); });
  }

  // ── Mutation helpers ──────────────────────────────────────────────────────

  function applyOptimisticMutation(nextUser: DirectoryUser) {
    setLocalItems((curr) => curr.map((u) => (u.id === nextUser.id ? nextUser : u)));
    if (selectedUser?.id === nextUser.id) setSelectedUser(nextUser);
  }

  const handleToggleAdmin = useCallback(async (user: DirectoryUser) => {
    if (!isConnectedSession || !canManageUserAccess) return;
    const makeAdmin = !isAdmin(user);
    if (!makeAdmin && !window.confirm(`${a.removeAdmin}: ${user.email}?`)) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/bff/admin/users/update-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id, systemRoles: makeAdmin ? [ADMIN_ROLE] : [] }),
      });
      const payload = (await res.json().catch(() => null)) as MutationRouteResponse | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        setErrorMessage(payload?.error?.message ?? 'Unable to update role.');
      } else {
        applyOptimisticMutation(payload.data.user);
        setStatusMessage(`${makeAdmin ? a.makeAdmin : a.removeAdmin}: ${user.email}.`);
        refresh();
      }
    } catch {
      setErrorMessage('Unable to reach the update-access route.');
    } finally {
      setBusy(false);
    }
  }, [isConnectedSession, canManageUserAccess, selectedUser]);

  const handleToggleBan = useCallback(async (user: DirectoryUser) => {
    if (!isConnectedSession || !canManageUserAccess) return;
    const ban = !user.suspendedAt;
    if (!window.confirm(`${ban ? a.ban : a.unban}: ${user.email}?`)) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/bff/admin/users/update-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id, suspend: ban }),
      });
      const payload = (await res.json().catch(() => null)) as MutationRouteResponse | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        setErrorMessage(payload?.error?.message ?? 'Unable to update ban state.');
      } else {
        applyOptimisticMutation(payload.data.user);
        setStatusMessage(`${ban ? a.ban : a.unban}: ${user.email}.`);
        refresh();
      }
    } catch {
      setErrorMessage('Unable to reach the update-access route.');
    } finally {
      setBusy(false);
    }
  }, [isConnectedSession, canManageUserAccess, selectedUser]);

  const handleDelete = useCallback(async (user: DirectoryUser) => {
    if (!isConnectedSession || !canManageUserAccess) return;
    if (!window.confirm(`${a.delete}: ${user.email}?`)) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/bff/admin/users/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const payload = (await res.json().catch(() => null)) as DeleteRouteResponse | null;
      if (!res.ok || !payload?.ok) {
        setErrorMessage(payload?.error?.message ?? 'Unable to delete user.');
      } else {
        setLocalItems((curr) => curr.filter((u) => u.id !== user.id));
        setSelectedUser(null);
        setStatusMessage(`Deleted account for ${user.email}.`);
        refresh();
      }
    } catch {
      setErrorMessage('Unable to reach the delete route.');
    } finally {
      setBusy(false);
    }
  }, [isConnectedSession, canManageUserAccess]);

  const handleCreateUser = useCallback(async (data: {
    email: string;
    password: string;
    displayName: string;
    isAdmin: boolean;
    emailVerified: boolean;
  }) => {
    if (!isConnectedSession || !canManageUserAccess) return;
    if (!data.email.trim() || !data.password.trim()) {
      setErrorMessage(`${a.email} + password required.`);
      return;
    }
    setCreatingUser(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/bff/admin/users/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: data.email.trim(),
          password: data.password.trim(),
          ...(data.displayName.trim() ? { displayName: data.displayName.trim() } : {}),
          systemRoles: data.isAdmin ? [ADMIN_ROLE] : [],
          emailVerified: data.emailVerified,
        }),
      });
      const payload = (await res.json().catch(() => null)) as MutationRouteResponse | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        setErrorMessage(payload?.error?.message ?? 'Unable to create user.');
      } else {
        setShowCreateModal(false);
        setStatusMessage(`${a.createUser}: ${payload.data.user.email}.`);
        refresh();
      }
    } catch {
      setErrorMessage('Unable to reach the create route.');
    } finally {
      setCreatingUser(false);
    }
  }, [isConnectedSession, canManageUserAccess]);

  const canManage = isConnectedSession && canManageUserAccess;

  return (
    <>
      {statusMessage ? (
        <div className="banner banner-info" style={{ marginBottom: '8px' }}>{statusMessage}</div>
      ) : null}
      {errorMessage ? (
        <div className="banner banner-error" style={{ marginBottom: '8px' }}>{errorMessage}</div>
      ) : null}

      <Toolbar
        query={draftQuery}
        role={draftRole}
        banned={draftBanned}
        verified={draftVerified}
        sort={draftSort}
        limit={draftLimit}
        isFiltered={hasActiveFilters}
        canManage={canManage}
        onQueryChange={handleQueryChange}
        onRoleChange={setDraftRole}
        onBannedChange={setDraftBanned}
        onVerifiedChange={setDraftVerified}
        onSortChange={setDraftSort}
        onLimitChange={setDraftLimit}
        onApply={applyFilters}
        onReset={resetFilters}
        onCreateUser={() => setShowCreateModal(true)}
      />

      {localItems.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(31,41,51,0.1)', textAlign: 'left' }}>
                {([a.user, a.email, a.role, a.verified, a.banned, a.created, a.lastLogin, a.actions] as const).map((col) => (
                  <th key={col} style={{ padding: '6px 10px', fontWeight: 600, fontSize: '0.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localItems.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    style={{
                      borderBottom: '1px solid rgba(31,41,51,0.07)',
                      cursor: 'pointer',
                      background: selectedUser?.id === user.id ? 'rgba(31,41,51,0.04)' : undefined,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(31,41,51,0.04)'; }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background =
                        selectedUser?.id === user.id ? 'rgba(31,41,51,0.04)' : '';
                    }}
                  >
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 500 }}>{user.displayName ?? <span style={{ color: 'var(--muted)' }}>—</span>}</span>
                      {isSelf ? <span className="tag-soft tag-soft--gray" style={{ marginLeft: '6px', fontSize: '0.7rem' }}>you</span> : null}
                    </td>
                    <td style={{ padding: '7px 10px' }}>{user.email}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      {isAdmin(user)
                        ? <span className="tag-soft" style={{ fontSize: '0.75rem' }}>{a.admin}</span>
                        : <span className="tag-soft tag-soft--gray" style={{ fontSize: '0.75rem' }}>{a.user}</span>}
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      {user.emailVerifiedAt
                        ? <span className="tag-soft tag-soft--green" style={{ fontSize: '0.75rem' }}>{a.verified}</span>
                        : <span className="tag-soft tag-soft--orange" style={{ fontSize: '0.75rem' }}>{a.unverified}</span>}
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      {user.suspendedAt
                        ? <span className="tag-soft tag-soft--orange" style={{ fontSize: '0.75rem' }}>{a.banned}</span>
                        : <span className="tag-soft tag-soft--gray" style={{ fontSize: '0.75rem' }}>{a.notBanned}</span>}
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{formatDate(user.createdAt)}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{formatDate(user.lastLoginAt)}</td>
                    <td
                      style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canManage && !isSelf ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => void handleToggleAdmin(user)}
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            type="button"
                          >
                            {isAdmin(user) ? a.removeAdmin : a.makeAdmin}
                          </button>
                          <button
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => void handleToggleBan(user)}
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            type="button"
                          >
                            {user.suspendedAt ? a.unban : a.ban}
                          </button>
                          <button
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => void handleDelete(user)}
                            style={{ fontSize: '0.75rem', padding: '2px 8px', color: 'var(--destructive, #c0392b)' }}
                            type="button"
                          >
                            {a.delete}
                          </button>
                        </div>
                      ) : <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : hasActiveFilters ? (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <span className="micro-label">No results</span>
          <h2>No users match the current filters</h2>
          <div className="link-row" style={{ justifyContent: 'center', marginTop: '12px' }}>
            <button className="btn-ghost" onClick={resetFilters} type="button">Reset filters</button>
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <span className="micro-label">No users</span>
          <h2>No users in this environment yet</h2>
        </div>
      )}

      {initialTotal > 0 ? (
        <Pagination
          page={initialPage}
          limit={initialLimit}
          total={initialTotal}
          onPage={goToPage}
        />
      ) : null}

      {selectedUser ? (
        <UserDrawer
          user={selectedUser}
          canManage={canManage}
          isSelf={selectedUser.id === currentUserId}
          busy={busy}
          onClose={() => setSelectedUser(null)}
          onToggleAdmin={(u) => void handleToggleAdmin(u)}
          onToggleBan={(u) => void handleToggleBan(u)}
          onDelete={(u) => void handleDelete(u)}
        />
      ) : null}

      {showCreateModal ? (
        <CreateUserModal
          busy={creatingUser}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => void handleCreateUser(data)}
        />
      ) : null}
    </>
  );
}
