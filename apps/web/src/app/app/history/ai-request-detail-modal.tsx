'use client';

import { useEffect, useState } from 'react';
import { type AiHistoryDetail } from '@quizmind/contracts';
import { formatUtcDateTime } from '../../../lib/datetime';

interface Props {
  id: string;
  onClose: () => void;
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

function extractPromptText(json: unknown, excerpt: string | null | undefined): string {
  if (typeof json === 'string') return json;
  if (Array.isArray(json)) {
    return json
      .map((msg: unknown) => {
        if (typeof msg === 'object' && msg !== null) {
          const m = msg as Record<string, unknown>;
          const role = typeof m.role === 'string' ? `[${m.role}]` : '';
          const content =
            typeof m.content === 'string'
              ? m.content
              : JSON.stringify(m.content, null, 2);
          return role ? `${role}\n${content}` : content;
        }
        return String(msg);
      })
      .join('\n\n');
  }
  if (json !== null && json !== undefined) return JSON.stringify(json, null, 2);
  return excerpt ?? '';
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

export function AiRequestDetailModal({ id, onClose }: Props) {
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

  const promptText = detail
    ? extractPromptText(detail.promptContentJson, detail.promptExcerpt)
    : '';
  const responseText = detail
    ? extractResponseText(detail.responseContentJson, detail.responseExcerpt)
    : '';

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
              <span className="tag-soft tag-soft--gray">{detail.provider}</span>
              {detail.totalTokens > 0 && (
                <span className="tag-soft tag-soft--gray">{detail.totalTokens} tokens</span>
              )}
              {detail.estimatedCostUsd > 0 && (
                <span className="tag-soft tag-soft--gray">${detail.estimatedCostUsd.toFixed(6)}</span>
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

            {/* Prompt */}
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
                {promptText && (
                  <button
                    className="btn-ghost"
                    onClick={() => copyText(promptText)}
                    style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                    type="button"
                  >
                    Copy
                  </button>
                )}
              </div>
              {promptText ? (
                <pre style={codeBlockStyle}>{promptText}</pre>
              ) : (
                <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: 0 }}>
                  No prompt content available.
                </p>
              )}
            </section>

            {/* Response */}
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
                {responseText && (
                  <button
                    className="btn-ghost"
                    onClick={() => copyText(responseText)}
                    style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                    type="button"
                  >
                    Copy
                  </button>
                )}
              </div>
              {responseText ? (
                <pre style={codeBlockStyle}>{responseText}</pre>
              ) : (
                <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: 0 }}>
                  No response content available.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
