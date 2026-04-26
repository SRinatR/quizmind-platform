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
  initialFilters: {
    query?: string;
    role: string;
    banned: string;
    verified: string;
    sort: string;
    page: number;
    limit: number;
  };
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

interface ListRouteResponse {
  ok: boolean;
  data?: AdminUsersSnapshot;
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
        <option value="created-asc">{a.oldestFirst}</option>
        <option value="login-desc">{a.recentLogin}</option>
        <option value="email-asc">{a.emailAZ}</option>
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
          {a.reset}
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
      <span>{from}–{to} {a.of} {total}</span>
      <button
        className="btn-ghost"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        style={{ fontSize: '0.8rem', padding: '3px 10px' }}
        type="button"
      >
        {a.prev}
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
        {a.next}
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
          {isSelf ? <span className="tag-soft tag-soft--gray">{a.you}</span> : null}
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
          <span className="form-field__label">{a.password}</span>
          <input
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={a.atLeast8Chars}
            type="password"
            value={password}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">{a.displayName} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({a.optional})</span></span>
          <input
            disabled={busy}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={a.optionalShort}
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
  initialFilters,
}: UsersDirectoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = usePreferences();
  const a = t.admin.users;
  const [, startTransition] = useTransition();

  // Local optimistic state: overrides applied after mutations until server refresh
  const [localItems, setLocalItems] = useState<DirectoryUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page);
  const [limit, setLimit] = useState(initialFilters.limit);
  const [isLoadingTable, setIsLoadingTable] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const requestSequenceRef = useRef(0);

  // Keep local items in sync when server sends new props (after navigation)
  // We use a key trick: items reference changes on every server render
  // ── Filter state (controlled, applied on Search / Enter / debounce) ─────────
  const [draftQuery, setDraftQuery] = useState(searchParams.get('userQuery') ?? initialFilters.query ?? '');
  const [draftRole, setDraftRole] = useState(searchParams.get('userRole') ?? initialFilters.role ?? 'all');
  const [draftBanned, setDraftBanned] = useState(searchParams.get('userBanned') ?? initialFilters.banned ?? 'all');
  const [draftVerified, setDraftVerified] = useState(searchParams.get('userVerified') ?? initialFilters.verified ?? 'all');
  const [draftSort, setDraftSort] = useState(searchParams.get('userSort') ?? initialFilters.sort ?? 'created-desc');
  const [draftLimit, setDraftLimit] = useState(Number(searchParams.get('userLimit') ?? initialFilters.limit ?? 25));

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

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestSequenceRef.current;
    const params = new URLSearchParams();
    const query = searchParams.get('userQuery');
    const role = searchParams.get('userRole');
    const banned = searchParams.get('userBanned');
    const verified = searchParams.get('userVerified');
    const sort = searchParams.get('userSort');
    const pageParam = searchParams.get('userPage');
    const limitParam = searchParams.get('userLimit');

    if (query) params.set('query', query);
    if (role) params.set('role', role);
    if (banned) params.set('banned', banned);
    if (verified) params.set('verified', verified);
    if (sort) params.set('sort', sort);
    if (pageParam) params.set('page', pageParam);
    if (limitParam) params.set('limit', limitParam);

    setIsLoadingTable(true);
    void fetch(`/bff/admin/users?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        if (requestId !== requestSequenceRef.current) return;
        const payload = (await res.json().catch(() => null)) as ListRouteResponse | null;
        if (!res.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? a.unavailableDesc);
        }
        setLocalItems(payload.data.items);
        setTotal(payload.data.total);
        setPage(payload.data.page);
        setLimit(payload.data.limit);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (requestId !== requestSequenceRef.current) return;
        setErrorMessage(error instanceof Error ? error.message : a.unavailableDesc);
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === requestSequenceRef.current) {
          setIsLoadingTable(false);
        }
      });

    return () => controller.abort();
  }, [searchParams, a.unavailableDesc, refreshTick]);

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
    setRefreshTick((value) => value + 1);
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
        setErrorMessage(payload?.error?.message ?? a.unableToUpdateRole);
      } else {
        applyOptimisticMutation(payload.data.user);
        setStatusMessage(`${makeAdmin ? a.makeAdmin : a.removeAdmin}: ${user.email}.`);
        refresh();
      }
    } catch {
      setErrorMessage(a.unableToReachUpdate);
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
        setErrorMessage(payload?.error?.message ?? a.unableToUpdateBan);
      } else {
        applyOptimisticMutation(payload.data.user);
        setStatusMessage(`${ban ? a.ban : a.unban}: ${user.email}.`);
        refresh();
      }
    } catch {
      setErrorMessage(a.unableToReachUpdate);
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
        setErrorMessage(payload?.error?.message ?? a.unableToDeleteUser);
      } else {
        setLocalItems((curr) => curr.filter((u) => u.id !== user.id));
        setSelectedUser(null);
        setStatusMessage(`${a.deletedAccountFor} ${user.email}.`);
        refresh();
      }
    } catch {
      setErrorMessage(a.unableToReachDelete);
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
      setErrorMessage(`${a.password} ${a.passwordRequired}`);
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
        setErrorMessage(payload?.error?.message ?? a.unableToCreateUser);
      } else {
        setShowCreateModal(false);
        setStatusMessage(`${a.createdUser}: ${payload.data.user.email}.`);
        refresh();
      }
    } catch {
      setErrorMessage(a.unableToReachCreate);
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

      {isLoadingTable ? (
        <section className="panel" style={{ padding: '14px 16px', fontSize: '0.82rem', color: 'var(--muted)' }}>
          {t.common.loading}
        </section>
      ) : localItems.length > 0 ? (
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
                      {isSelf ? <span className="tag-soft tag-soft--gray" style={{ marginLeft: '6px', fontSize: '0.7rem' }}>{a.you}</span> : null}
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
          <span className="micro-label">{a.noResults}</span>
          <h2>{a.noUsersMatchFilters}</h2>
          <div className="link-row" style={{ justifyContent: 'center', marginTop: '12px' }}>
            <button className="btn-ghost" onClick={resetFilters} type="button">{a.resetFilters}</button>
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <span className="micro-label">{a.noUsers}</span>
          <h2>{a.noUsersInEnvironment}</h2>
        </div>
      )}

      {total > 0 ? (
        <Pagination
          page={page}
          limit={limit}
          total={total}
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
