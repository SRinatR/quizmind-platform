'use client';

import { useEffect, useState } from 'react';
import { type AiHistoryDetail } from '@quizmind/contracts';
import { formatUtcDateTime } from '../../../lib/datetime';
import type { ExchangeRateSnapshot } from '../../../lib/exchange-rates';
import { formatUsdAmountByPreference } from '../../../lib/money';
import { usePreferences } from '../../../lib/preferences';

interface Props {
  id: string;
  onClose: () => void;
  exchangeRates: ExchangeRateSnapshot | null;
}

type FetchPayload =
  | { ok: true; data: AiHistoryDetail }
  | { ok: false; error: { message: string } };

function statusBadgeClass(status: string): string {
  if (status === 'success') return 'tag-soft tag-soft--green';
  if (status === 'error') return 'tag-soft tag-soft--orange';
  if (status === 'quota_exceeded') return 'tag-soft tag-soft--orange';
  return 'tag-soft tag-soft--gray';
}

interface ParsedPrompt {
  userText: string;
  systemText: string;
  fallbackText: string;
}

function parsePrompt(json: unknown, excerpt: string | null | undefined): ParsedPrompt {
  if (Array.isArray(json)) {
    const msgs = json as Array<Record<string, unknown>>;
    const userParts = msgs
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)));
    const systemParts = msgs
      .filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)));
    return {
      userText: userParts.join('\n\n'),
      systemText: systemParts.join('\n\n'),
      fallbackText: '',
    };
  }
  // non-array: use existing behavior as fallback
  let fallback = '';
  if (typeof json === 'string') fallback = json;
  else if (json !== null && json !== undefined) fallback = JSON.stringify(json, null, 2);
  else fallback = excerpt ?? '';
  return { userText: '', systemText: '', fallbackText: fallback };
}

function extractFinalAnswer(json: unknown): string {
  try {
    const obj = json as Record<string, unknown>;
    const choices = obj?.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const msg = first?.message as Record<string, unknown> | undefined;
      if (typeof msg?.content === 'string') return msg.content;
    }
  } catch {
    // fall through
  }
  return '';
}

function extractResponseText(json: unknown, excerpt: string | null | undefined): string {
  if (typeof json === 'string') return json;
  if (json !== null && json !== undefined) return JSON.stringify(json, null, 2);
  return excerpt ?? '';
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

const codeBlockStyle: React.CSSProperties = {
  background: 'var(--color-surface-alt, #f4f4f5)',
  borderRadius: '6px',
  padding: '12px',
  fontSize: '0.8rem',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '320px',
  overflowY: 'auto',
  margin: 0,
  fontFamily: 'monospace',
};

function ExpandableSection({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: '12px' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: '0.78rem',
          opacity: 0.55,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span style={{ fontFamily: 'monospace' }}>{open ? '▾' : '▸'}</span>
        {label}
      </button>
      {open && <pre style={{ ...codeBlockStyle, marginTop: '6px' }}>{content}</pre>}
    </div>
  );
}

export function AiRequestDetailModal({ id, onClose, exchangeRates }: Props) {
  const { prefs } = usePreferences();
  const [detail, setDetail] = useState<AiHistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setDetail(null);

    fetch(`/bff/history/${encodeURIComponent(id)}`)
      .then((r) => r.json() as Promise<FetchPayload>)
      .then((payload) => {
        if (cancelled) return;
        if (payload.ok) {
          setDetail(payload.data);
        } else {
          setFetchError(payload.error.message);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError('Failed to load detail.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  const parsed = detail ? parsePrompt(detail.promptContentJson, detail.promptExcerpt) : null;
  const displayPrompt = parsed
    ? (parsed.userText || parsed.fallbackText)
    : '';

  const rawResponseText = detail
    ? extractResponseText(detail.responseContentJson, detail.responseExcerpt)
    : '';
  const finalAnswer = detail ? extractFinalAnswer(detail.responseContentJson) : '';
  const displayResponse = finalAnswer || rawResponseText;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px 60px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'var(--color-surface, #fff)',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '760px',
          position: 'relative',
          boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        }}
      >
        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '14px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.4rem',
            lineHeight: 1,
            opacity: 0.5,
            padding: '0 4px',
          }}
        >
          ×
        </button>

        <span className="micro-label">AI Request Detail</span>
        <h2 style={{ marginTop: '4px', marginBottom: '16px', paddingRight: '32px' }}>
          {detail?.model ?? (loading ? 'Loading…' : '—')}
        </h2>

        {loading && <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Loading…</p>}

        {fetchError && !loading && (
          <div className="empty-state">
            <span className="micro-label">Error</span>
            <p>{fetchError}</p>
          </div>
        )}

        {detail && !loading && (
          <>
            {/* Status / meta tags */}
            <div className="tag-row" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
              <span className={statusBadgeClass(detail.status)}>{detail.status}</span>
              <span className="tag-soft tag-soft--gray">{detail.requestType}</span>
              {detail.totalTokens > 0 && (
                <span className="tag-soft tag-soft--gray">{detail.totalTokens} tokens</span>
              )}
              {detail.estimatedCostUsd > 0 && (
                <span className="tag-soft tag-soft--gray">
                  {formatUsdAmountByPreference(detail.estimatedCostUsd, prefs.balanceDisplayCurrency, exchangeRates)}
                </span>
              )}
              {detail.durationMs != null && (
                <span className="tag-soft tag-soft--gray">{detail.durationMs} ms</span>
              )}
            </div>

            {/* Timestamp + extra meta */}
            <div style={{ fontSize: '0.82rem', opacity: 0.65, marginBottom: '20px' }}>
              {formatUtcDateTime(detail.occurredAt)}
              {detail.errorCode ? ` · error: ${detail.errorCode}` : ''}
              {detail.fileMetadata
                ? ` · ${detail.fileMetadata.originalName} (${(detail.fileMetadata.sizeBytes / 1024).toFixed(0)} KB, ${detail.fileMetadata.mimeType})`
                : ''}
            </div>

            {/* Token breakdown */}
            {(detail.promptTokens > 0 || detail.completionTokens > 0) && (
              <div style={{ fontSize: '0.78rem', opacity: 0.55, marginBottom: '20px' }}>
                {detail.promptTokens} prompt tokens · {detail.completionTokens} completion tokens
              </div>
            )}

            {/* Prompt — user message only */}
            <section style={{ marginBottom: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <span className="micro-label">Request / Prompt</span>
                {displayPrompt && (
                  <button
                    className="btn-ghost"
                    onClick={() => copyText(displayPrompt)}
                    style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                    type="button"
                  >
                    Copy
                  </button>
                )}
              </div>
              {displayPrompt ? (
                <pre style={codeBlockStyle}>{displayPrompt}</pre>
              ) : (
                <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: 0 }}>
                  No prompt content available.
                </p>
              )}
              {parsed?.systemText && (
                <ExpandableSection label="System" content={parsed.systemText} />
              )}
            </section>

            {/* Response — final answer only */}
            <section>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <span className="micro-label">Response</span>
                {displayResponse && (
                  <button
                    className="btn-ghost"
                    onClick={() => copyText(displayResponse)}
                    style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                    type="button"
                  >
                    Copy
                  </button>
                )}
              </div>
              {displayResponse ? (
                <pre style={codeBlockStyle}>{displayResponse}</pre>
              ) : (
                <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: 0 }}>
                  No response content available.
                </p>
              )}
              {rawResponseText && (
                <ExpandableSection label="Raw response" content={rawResponseText} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
