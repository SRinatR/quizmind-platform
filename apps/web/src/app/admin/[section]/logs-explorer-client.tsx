'use client';

import {
  adminLogCategoryFilters,
  adminLogExportFormats,
  adminLogSeverityFilters,
  adminLogSourceFilters,
  adminLogStatusFilters,
  adminLogStreamFilters,
  type AdminLogCategoryFilter,
  type AdminLogEntry,
  type AdminLogExportFormat,
  type AdminLogExportResult,
  type AdminLogFilters,
  type AdminLogSourceFilter,
} from '@quizmind/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { type AdminLogsStateSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

interface LogsExplorerClientProps {
  initialFilters: AdminLogFilters;
  canExportLogs: boolean;
  isConnectedSession: boolean;
}

interface MutationRouteResponse<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

type LogListRouteResponse = MutationRouteResponse<AdminLogsStateSnapshot>;

// ── Datetime-local helpers ────────────────────────────────────────────────────

/**
 * datetime-local inputs emit "YYYY-MM-DDTHH:mm" (no timezone).
 * We treat the admin UI as UTC, so append explicit UTC suffix before sending to the API.
 */
function toIsoUtc(localStr: string): string {
  if (!localStr) return localStr;
  // "YYYY-MM-DDTHH:mm"   → append ":00.000Z"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStr)) return `${localStr}:00.000Z`;
  // "YYYY-MM-DDTHH:mm:ss" → append ".000Z"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(localStr)) return `${localStr}.000Z`;
  return localStr; // already has timezone
}

/**
 * Convert an ISO/UTC string back to the "YYYY-MM-DDTHH:mm" format
 * that datetime-local inputs expect (always display in UTC).
 */
function fromIsoToLocalInput(isoStr?: string): string {
  if (!isoStr) return '';
  // Slice to 16 chars: "YYYY-MM-DDTHH:mm"
  return isoStr.slice(0, 16);
}

// ── Presets ───────────────────────────────────────────────────────────────────

interface QuickPreset {
  label: string;
  filters: Partial<AdminLogFilters>;
}

const QUICK_PRESETS: QuickPreset[] = [
  { label: 'Failed logins', filters: { category: 'auth', status: 'failure' } },
  { label: 'Extension bindings', filters: { category: 'extension' } },
  { label: 'AI requests', filters: { category: 'ai' } },
  { label: 'Admin actions', filters: { category: 'admin' } },
  { label: 'Failures', filters: { status: 'failure', severity: 'error' } },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadExportFile(result: AdminLogExportResult) {
  const blob = new Blob([result.content], { type: result.contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildNextSearchParams(
  current: URLSearchParams,
  next: Partial<AdminLogFilters>,
): URLSearchParams {
  const params = new URLSearchParams(current.toString());

  const set = (key: string, val: string | number | undefined | null, defaultVal?: string) => {
    if (val === undefined || val === null || val === '' || val === defaultVal) {
      params.delete(key);
    } else {
      params.set(key, String(val));
    }
  };

  if ('stream' in next) set('logStream', next.stream, 'all');
  if ('severity' in next) set('logSeverity', next.severity, 'all');
  if ('search' in next) set('logSearch', next.search);
  if ('limit' in next) set('logLimit', next.limit, '25');
  if ('category' in next) set('logCategory', next.category, 'all');
  if ('source' in next) set('logSource', next.source, 'all');
  if ('status' in next) set('logStatus', next.status, 'all');
  if ('eventType' in next) set('logEventType', next.eventType);
  if ('from' in next) set('logFrom', next.from);
  if ('to' in next) set('logTo', next.to);
  if ('page' in next) set('logPage', next.page, '1');

  return params;
}

function categoryBadgeClass(category?: string): string {
  switch (category) {
    case 'auth': return 'tag-soft tag-soft--blue';
    case 'extension': return 'tag-soft tag-soft--purple';
    case 'ai': return 'tag-soft tag-soft--green';
    case 'admin': return 'tag-soft tag-soft--gray';
    case 'system': return 'tag-soft tag-soft--orange';
    default: return 'tag-soft tag-soft--gray';
  }
}

function statusBadgeClass(status?: string): string {
  if (status === 'failure') return 'tag-soft tag-soft--orange';
  if (status === 'success') return 'tag-soft tag-soft--green';
  return 'tag-soft tag-soft--gray';
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd?: number): string {
  if (usd === undefined || usd === null) return '—';
  if (usd < 0.001) return `<$0.001`;
  return `$${usd.toFixed(4)}`;
}

function actorLabel(entry: AdminLogEntry): string {
  return entry.actor?.displayName ?? entry.actor?.email ?? entry.actor?.id ?? '—';
}

function targetLabel(entry: AdminLogEntry): string {
  if (entry.targetType && entry.targetId) return `${entry.targetType} ${entry.targetId}`;
  if (entry.targetType) return entry.targetType;
  if (entry.installationId) return `install ${entry.installationId}`;
  return '—';
}

// ── Details drawer ────────────────────────────────────────────────────────────

function DetailsDrawer({
  entry,
  onClose,
}: {
  entry: AdminLogEntry;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        maxWidth: '95vw',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        overflowY: 'auto',
        zIndex: 100,
        padding: '20px',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <span className="micro-label">Event detail</span>
          <h3 style={{ margin: '4px 0 0', fontSize: '0.95rem', wordBreak: 'break-all' }}>{entry.eventType}</h3>
        </div>
        <button
          className="btn-ghost"
          onClick={onClose}
          type="button"
          style={{ padding: '4px 10px', flexShrink: 0, marginLeft: '8px' }}
        >
          Close
        </button>
      </div>

      <div className="kv-list">
        <div className="kv-row">
          <span className="kv-row__key">Time</span>
          <span className="kv-row__value">{formatUtcDateTime(entry.occurredAt)}</span>
        </div>
        <div className="kv-row">
          <span className="kv-row__key">Category</span>
          <span className="kv-row__value">
            <span className={categoryBadgeClass(entry.category)}>{entry.category ?? '—'}</span>
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-row__key">Stream</span>
          <span className="kv-row__value">{entry.stream}</span>
        </div>
        {entry.source ? (
          <div className="kv-row">
            <span className="kv-row__key">Source</span>
            <span className="kv-row__value">{entry.source}</span>
          </div>
        ) : null}
        <div className="kv-row">
          <span className="kv-row__key">Status</span>
          <span className="kv-row__value">
            <span className={statusBadgeClass(entry.status)}>{entry.status ?? '—'}</span>
          </span>
        </div>
        {entry.severity ? (
          <div className="kv-row">
            <span className="kv-row__key">Severity</span>
            <span className="kv-row__value">{entry.severity}</span>
          </div>
        ) : null}
      </div>

      {entry.actor ? (
        <>
          <p className="micro-label" style={{ marginTop: '16px', marginBottom: '6px' }}>Actor</p>
          <div className="kv-list">
            <div className="kv-row"><span className="kv-row__key">ID</span><span className="kv-row__value" style={{ wordBreak: 'break-all' }}>{entry.actor.id}</span></div>
            {entry.actor.email ? <div className="kv-row"><span className="kv-row__key">Email</span><span className="kv-row__value">{entry.actor.email}</span></div> : null}
            {entry.actor.displayName ? <div className="kv-row"><span className="kv-row__key">Name</span><span className="kv-row__value">{entry.actor.displayName}</span></div> : null}
          </div>
        </>
      ) : null}

      {(entry.targetType || entry.targetId) ? (
        <>
          <p className="micro-label" style={{ marginTop: '16px', marginBottom: '6px' }}>Target</p>
          <div className="kv-list">
            {entry.targetType ? <div className="kv-row"><span className="kv-row__key">Type</span><span className="kv-row__value">{entry.targetType}</span></div> : null}
            {entry.targetId ? <div className="kv-row"><span className="kv-row__key">ID</span><span className="kv-row__value" style={{ wordBreak: 'break-all' }}>{entry.targetId}</span></div> : null}
          </div>
        </>
      ) : null}

      {(entry.installationId || entry.provider || entry.model || entry.durationMs !== undefined || entry.costUsd !== undefined || entry.promptTokens !== undefined) ? (
        <>
          <p className="micro-label" style={{ marginTop: '16px', marginBottom: '6px' }}>Request</p>
          <div className="kv-list">
            {entry.installationId ? <div className="kv-row"><span className="kv-row__key">Installation</span><span className="kv-row__value" style={{ wordBreak: 'break-all' }}>{entry.installationId}</span></div> : null}
            {entry.provider ? <div className="kv-row"><span className="kv-row__key">Provider</span><span className="kv-row__value">{entry.provider}</span></div> : null}
            {entry.model ? <div className="kv-row"><span className="kv-row__key">Model</span><span className="kv-row__value">{entry.model}</span></div> : null}
            {entry.durationMs !== undefined ? <div className="kv-row"><span className="kv-row__key">Duration</span><span className="kv-row__value">{formatDuration(entry.durationMs)}</span></div> : null}
            {entry.costUsd !== undefined ? <div className="kv-row"><span className="kv-row__key">Cost</span><span className="kv-row__value">{formatCost(entry.costUsd)}</span></div> : null}
            {entry.promptTokens !== undefined ? <div className="kv-row"><span className="kv-row__key">Prompt tokens</span><span className="kv-row__value">{entry.promptTokens}</span></div> : null}
            {entry.completionTokens !== undefined ? <div className="kv-row"><span className="kv-row__key">Completion tokens</span><span className="kv-row__value">{entry.completionTokens}</span></div> : null}
            {entry.totalTokens !== undefined ? <div className="kv-row"><span className="kv-row__key">Total tokens</span><span className="kv-row__value">{entry.totalTokens}</span></div> : null}
          </div>
        </>
      ) : null}

      {entry.errorSummary ? (
        <>
          <p className="micro-label" style={{ marginTop: '16px', marginBottom: '6px', color: 'var(--warn)' }}>Error</p>
          <pre style={{ fontSize: '0.78rem', background: 'var(--surface-2)', padding: '8px 10px', borderRadius: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {entry.errorSummary}
          </pre>
        </>
      ) : null}

      {entry.summary ? (
        <>
          <p className="micro-label" style={{ marginTop: '16px', marginBottom: '6px' }}>Summary</p>
          <p style={{ fontSize: '0.83rem', margin: 0 }}>{entry.summary}</p>
        </>
      ) : null}

      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
        <>
          <p className="micro-label" style={{ marginTop: '16px', marginBottom: '6px' }}>Metadata</p>
          <pre style={{ fontSize: '0.75rem', background: 'var(--surface-2)', padding: '8px 10px', borderRadius: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: '240px', overflow: 'auto' }}>
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </>
      ) : null}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LogsExplorerClient({
  initialFilters,
  canExportLogs,
  isConnectedSession,
}: LogsExplorerClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [snapshot, setSnapshot] = useState<AdminLogsStateSnapshot | null>(null);
  const [isLoadingTable, setIsLoadingTable] = useState(true);
  const [searchDraft, setSearchDraft] = useState(initialFilters.search ?? '');
  const [fromDraft, setFromDraft] = useState(() => fromIsoToLocalInput(initialFilters.from));
  const [toDraft, setToDraft] = useState(() => fromIsoToLocalInput(initialFilters.to));
  const [eventTypeDraft, setEventTypeDraft] = useState(initialFilters.eventType ?? '');
  const [exportFormat, setExportFormat] = useState<AdminLogExportFormat>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AdminLogEntry | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const effectiveSnapshot = useMemo<AdminLogsStateSnapshot>(() => (
    snapshot ?? {
      personaKey: 'connected-user',
      accessDecision: { allowed: true, reasons: [] },
      exportDecision: { allowed: canExportLogs, reasons: [] },
      filters: initialFilters,
      items: [],
      streamCounts: { audit: 0, activity: 0, security: 0, domain: 0 },
      categoryCounts: { auth: 0, extension: 0, ai: 0, admin: 0, system: 0 },
      total: 0,
      hasNext: false,
      permissions: [],
    }
  ), [snapshot, initialFilters, canExportLogs]);

  function pushFilters(next: Partial<AdminLogFilters>) {
    const params = buildNextSearchParams(searchParams, next);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    const map: Record<string, string> = {
      logStream: 'stream',
      logSeverity: 'severity',
      logSearch: 'search',
      logLimit: 'limit',
      logCategory: 'category',
      logSource: 'source',
      logStatus: 'status',
      logEventType: 'eventType',
      logFrom: 'from',
      logTo: 'to',
      logPage: 'page',
    };
    Object.entries(map).forEach(([urlKey, apiKey]) => {
      const value = searchParams.get(urlKey);
      if (value) params.set(apiKey, value);
    });

    setIsLoadingTable(true);
    void fetch(`/bff/admin/logs?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as LogListRouteResponse | null;
        if (!res.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? 'Unable to load logs.');
        }
        setSnapshot(payload.data);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load logs.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingTable(false);
      });

    return () => controller.abort();
  }, [searchParams]);

  function applyAllFilters() {
    setErrorMessage(null);
    pushFilters({
      search: searchDraft,
      from: fromDraft ? toIsoUtc(fromDraft) : undefined,
      to: toDraft ? toIsoUtc(toDraft) : undefined,
      eventType: eventTypeDraft || undefined,
      page: 1,
    });
  }

  function applyPreset(preset: QuickPreset) {
    setSearchDraft('');
    setFromDraft('');
    setToDraft('');
    setEventTypeDraft('');
    setErrorMessage(null);
    pushFilters({
      search: '',
      from: undefined,
      to: undefined,
      eventType: undefined,
      severity: 'all',
      stream: 'all',
      page: 1,
      ...preset.filters,
    });
  }

  function resetFilters() {
    setSearchDraft('');
    setFromDraft('');
    setToDraft('');
    setEventTypeDraft('');
    setErrorMessage(null);
    pushFilters({
      stream: 'all',
      severity: 'all',
      search: '',
      limit: 25,
      category: undefined,
      source: undefined,
      status: undefined,
      eventType: undefined,
      from: undefined,
      to: undefined,
      page: 1,
    });
  }

  async function exportLogs() {
    if (!isConnectedSession) {
      setErrorMessage('Sign in with a connected session to export logs.');
      return;
    }
    if (!canExportLogs) {
      setErrorMessage('This session does not have audit_logs:export permission.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    setStatusMessage('Preparing export...');

    try {
      const response = await fetch('/bff/admin/logs/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stream: effectiveSnapshot.filters.stream,
          severity: effectiveSnapshot.filters.severity,
          ...(effectiveSnapshot.filters.search ? { search: effectiveSnapshot.filters.search } : {}),
          limit: effectiveSnapshot.filters.limit,
          format: exportFormat,
          ...(effectiveSnapshot.filters.category ? { category: effectiveSnapshot.filters.category } : {}),
          ...(effectiveSnapshot.filters.source ? { source: effectiveSnapshot.filters.source } : {}),
          ...(effectiveSnapshot.filters.status ? { status: effectiveSnapshot.filters.status } : {}),
          ...(effectiveSnapshot.filters.eventType ? { eventType: effectiveSnapshot.filters.eventType } : {}),
          ...(effectiveSnapshot.filters.from ? { from: effectiveSnapshot.filters.from } : {}),
          ...(effectiveSnapshot.filters.to ? { to: effectiveSnapshot.filters.to } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<AdminLogExportResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsExporting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Export failed.');
        return;
      }

      downloadExportFile(payload.data);
      setIsExporting(false);
      setStatusMessage(`Exported ${payload.data.fileName} (${payload.data.itemCount} rows).`);
    } catch {
      setIsExporting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the export route.');
    }
  }

  async function handleViewEntry(item: AdminLogEntry) {
    if (selectedEntry?.id === item.id) {
      setSelectedEntry(null);
      return;
    }
    setSelectedEntry(item);
    setIsLoadingDetail(true);
    try {
      const response = await fetch(`/bff/admin/logs/${encodeURIComponent(item.id)}`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<AdminLogEntry> | null;
      if (response.ok && payload?.ok && payload.data) {
        setSelectedEntry(payload.data);
      }
    } finally {
      setIsLoadingDetail(false);
    }
  }

  const filters = effectiveSnapshot.filters;
  const counts = effectiveSnapshot.categoryCounts;

  return (
    <>
      {/* ── Overlay when drawer is open ── */}
      {selectedEntry ? (
        <div
          onClick={() => setSelectedEntry(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 99,
          }}
        />
      ) : null}

      {/* ── Compact toolbar ── */}
      <section className="panel" style={{ padding: '12px 16px' }}>
        {/* Row 1: time range + event type + search + stream/severity/status selects */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="filter-field" style={{ minWidth: '130px', flex: '0 0 auto' }}>
            <span className="filter-field__label">From</span>
            <input
              type="datetime-local"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
              style={{ fontSize: '0.8rem' }}
            />
          </label>
          <label className="filter-field" style={{ minWidth: '130px', flex: '0 0 auto' }}>
            <span className="filter-field__label">To</span>
            <input
              type="datetime-local"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
              style={{ fontSize: '0.8rem' }}
            />
          </label>
          <label className="filter-field" style={{ flex: '1 1 140px', minWidth: '120px' }}>
            <span className="filter-field__label">Search</span>
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyAllFilters(); } }}
              placeholder="event type, user, summary…"
              style={{ fontSize: '0.82rem' }}
            />
          </label>
          <label className="filter-field" style={{ flex: '1 1 120px', minWidth: '100px' }}>
            <span className="filter-field__label">Event type</span>
            <input
              value={eventTypeDraft}
              onChange={(e) => setEventTypeDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyAllFilters(); } }}
              placeholder="auth.login_failed"
              style={{ fontSize: '0.82rem' }}
            />
          </label>
          <label className="filter-field" style={{ flex: '0 0 auto' }}>
            <span className="filter-field__label">Category</span>
            <select
              value={filters.category ?? 'all'}
              onChange={(e) => pushFilters({ category: e.target.value as AdminLogCategoryFilter, page: 1 })}
              style={{ fontSize: '0.82rem' }}
            >
              {adminLogCategoryFilters.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'all categories' : c}
                  {c !== 'all' && counts ? ` (${counts[c as keyof typeof counts] ?? 0})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field" style={{ flex: '0 0 auto' }}>
            <span className="filter-field__label">Source</span>
            <select
              value={filters.source ?? 'all'}
              onChange={(e) => pushFilters({ source: e.target.value as AdminLogSourceFilter, page: 1 })}
              style={{ fontSize: '0.82rem' }}
            >
              {adminLogSourceFilters.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="filter-field" style={{ flex: '0 0 auto' }}>
            <span className="filter-field__label">Severity</span>
            <select
              value={filters.severity}
              onChange={(e) => pushFilters({ severity: e.target.value as AdminLogFilters['severity'], page: 1 })}
              style={{ fontSize: '0.82rem' }}
            >
              {adminLogSeverityFilters.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="filter-field" style={{ flex: '0 0 auto' }}>
            <span className="filter-field__label">Status</span>
            <select
              value={filters.status ?? 'all'}
              onChange={(e) => pushFilters({ status: e.target.value as AdminLogFilters['status'], page: 1 })}
              style={{ fontSize: '0.82rem' }}
            >
              {adminLogStatusFilters.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="filter-field" style={{ flex: '0 0 auto' }}>
            <span className="filter-field__label">Stream</span>
            <select
              value={filters.stream}
              onChange={(e) => pushFilters({ stream: e.target.value as AdminLogFilters['stream'], page: 1 })}
              style={{ fontSize: '0.82rem' }}
            >
              {adminLogStreamFilters.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="filter-field" style={{ flex: '0 0 auto' }}>
            <span className="filter-field__label">Limit</span>
            <select
              value={String(filters.limit)}
              onChange={(e) => pushFilters({ limit: Number(e.target.value), page: 1 })}
              style={{ fontSize: '0.82rem' }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Row 2: actions + presets + export */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
          <button className="btn-primary" onClick={applyAllFilters} type="button" style={{ fontSize: '0.82rem', padding: '5px 14px' }}>
            Apply
          </button>
          <button className="btn-ghost" onClick={resetFilters} type="button" style={{ fontSize: '0.82rem', padding: '5px 12px' }}>
            Reset
          </button>

          <span style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />

          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              className="btn-ghost"
              onClick={() => applyPreset(preset)}
              type="button"
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}
            >
              {preset.label}
            </button>
          ))}

          <span style={{ flex: 1 }} />

          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as AdminLogExportFormat)}
            style={{ fontSize: '0.78rem', padding: '4px 6px' }}
          >
            {adminLogExportFormats.map((f) => (
              <option key={f} value={f}>{f.toUpperCase()}</option>
            ))}
          </select>
          <button
            className="btn-ghost"
            disabled={isExporting || !canExportLogs}
            onClick={() => void exportLogs()}
            type="button"
            style={{ fontSize: '0.78rem', padding: '4px 12px' }}
          >
            {isExporting ? 'Exporting…' : 'Export'}
          </button>
        </div>

        {/* Status / error line */}
        {statusMessage ? (
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '8px 0 0' }}>{statusMessage}</p>
        ) : null}
        {errorMessage ? (
          <p style={{ fontSize: '0.78rem', color: 'var(--error, red)', margin: '8px 0 0' }}>{errorMessage}</p>
        ) : null}
      </section>

      {/* ── Category counters ── */}
      {counts ? (
        <div className="tag-row" style={{ padding: '0 2px' }}>
          <span className="tag-soft tag-soft--gray">
            {effectiveSnapshot.total} total{effectiveSnapshot.items.length !== effectiveSnapshot.total ? ` · ${effectiveSnapshot.items.length} on page` : ''}
          </span>
          {(['auth', 'extension', 'ai', 'admin', 'system'] as const).map((cat) => (
            counts[cat] > 0 ? (
              <button
                key={cat}
                className={categoryBadgeClass(cat)}
                onClick={() => pushFilters({ category: cat, page: 1 })}
                type="button"
                style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
              >
                {cat} {counts[cat]}
              </button>
            ) : null
          ))}
        </div>
      ) : null}

      {/* ── Log table ── */}
      <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoadingTable ? (
          <div style={{ padding: '20px', fontSize: '0.82rem', color: 'var(--muted)' }}>Loading…</div>
        ) : effectiveSnapshot.items.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  {(['Time', 'Cat', 'Event', 'User', 'Source', 'Status', 'Target', 'Dur', 'Cost', ''] as const).map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '7px 10px',
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: '0.72rem',
                        color: 'var(--muted)',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {effectiveSnapshot.items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => void handleViewEntry(item)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedEntry?.id === item.id ? 'var(--surface-2)' : undefined,
                    }}
                  >
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {formatUtcDateTime(item.occurredAt)}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span className={categoryBadgeClass(item.category)} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                        {item.category ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', maxWidth: '220px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{item.eventType}</span>
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {actorLabel(item)}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      {item.source ? (
                        <span className="tag-soft tag-soft--gray" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>{item.source}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <span className={statusBadgeClass(item.status)} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                        {item.status ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {targetLabel(item)}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {formatDuration(item.durationMs)}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {formatCost(item.costUsd)}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <button className="btn-ghost" type="button" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <span className="micro-label">No entries</span>
            <h2>No log entries matched the current filters</h2>
          </div>
        )}
      </section>

      {/* ── Pagination ── */}
      {(effectiveSnapshot.items.length > 0 || (filters.page ?? 1) > 1) ? (
        <div className="tag-row" style={{ padding: '4px 0' }}>
          <button
            className="btn-ghost"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => pushFilters({ page: (filters.page ?? 1) - 1 })}
            type="button"
            style={{ fontSize: '0.8rem', padding: '4px 12px' }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Page {filters.page ?? 1} · {effectiveSnapshot.total} total
          </span>
          <button
            className="btn-ghost"
            disabled={!effectiveSnapshot.hasNext}
            onClick={() => pushFilters({ page: (filters.page ?? 1) + 1 })}
            type="button"
            style={{ fontSize: '0.8rem', padding: '4px 12px' }}
          >
            Next →
          </button>
        </div>
      ) : null}

      {/* ── Details drawer ── */}
      {selectedEntry ? (
        <>
          {isLoadingDetail ? <div className="panel" style={{ position: 'fixed', top: '12px', right: '12px', zIndex: 120, padding: '8px 10px', fontSize: '0.78rem' }}>Loading…</div> : null}
          <DetailsDrawer entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
        </>
      ) : null}
    </>
  );
}
