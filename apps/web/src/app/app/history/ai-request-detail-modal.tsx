'use client';

import { useEffect, useMemo, useState } from 'react';
import { type AiHistoryAttachment, type AiHistoryDetail } from '@quizmind/contracts';
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
  hasImageInput: boolean;
}

const QUICK_ANSWER_USER_PREFIX = 'Return only the final answer without solution steps. If options are labeled (letters or numbers), return ONLY correct labels separated by commas (for example: a, d). If the question has options but they are unlabeled, number from 1 and answer as: N) option text. If no options exist (free-text question), return ONLY the answer. Question:';
const VISION_USER_PREFIX = 'Read the screenshot carefully. Double-check option labels before answering. If options are labeled, output only labels (e.g. a, d). If unlabeled options exist, output: N) option text. If no options (text/fill-in question), output only the answer text. Return final answer only.';

interface DisplayPromptResult {
  mainText: string;
  promptInstruction: string;
  prefixRemoved: boolean;
  hideCopy: boolean;
}

function parsePrompt(json: unknown, excerpt: string | null | undefined): ParsedPrompt {
  if (Array.isArray(json)) {
    const msgs = json as Array<Record<string, unknown>>;
    const gather = (role: string) => msgs
      .filter((m) => m.role === role)
      .flatMap((m) => {
        const c = m.content;
        if (typeof c === 'string') return [c];
        if (Array.isArray(c)) {
          return (c as Array<Record<string, unknown>>)
            .filter((b) => b.type === 'text' && typeof b.text === 'string')
            .map((b) => b.text as string);
        }
        return [];
      });

    const hasImageInput = msgs.some((m) => {
      if (m.role !== 'user') return false;
      const c = m.content;
      if (!Array.isArray(c)) return false;
      return (c as Array<Record<string, unknown>>).some((b) => {
        const t = typeof b.type === 'string' ? b.type : '';
        return t.includes('image');
      });
    });

    return {
      userText: gather('user').join('\n\n'),
      systemText: gather('system').join('\n\n'),
      fallbackText: '',
      hasImageInput,
    };
  }

  let fallback = '';
  if (typeof json === 'string') fallback = json;
  else if (json !== null && json !== undefined) fallback = JSON.stringify(json, null, 2);
  else fallback = excerpt ?? '';
  fallback = fallback.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[image attachment omitted]');
  return { userText: '', systemText: '', fallbackText: fallback, hasImageInput: false };
}

function getPromptInstructionAndQuestion(parsed: ParsedPrompt, hasPromptImages: boolean): DisplayPromptResult {
  const basePrompt = parsed.userText || parsed.fallbackText;
  if (!parsed.userText) {
    return { mainText: basePrompt, promptInstruction: '', prefixRemoved: false, hideCopy: false };
  }

  if (parsed.userText.startsWith(QUICK_ANSWER_USER_PREFIX)) {
    const mainText = parsed.userText.slice(QUICK_ANSWER_USER_PREFIX.length).trim();
    return {
      mainText,
      promptInstruction: QUICK_ANSWER_USER_PREFIX,
      prefixRemoved: true,
      hideCopy: false,
    };
  }

  const hasImageInput = parsed.hasImageInput || hasPromptImages;
  if (hasImageInput && parsed.userText.startsWith(VISION_USER_PREFIX)) {
    const cleaned = parsed.userText.slice(VISION_USER_PREFIX.length).trim();
    return {
      mainText: cleaned,
      promptInstruction: VISION_USER_PREFIX,
      prefixRemoved: true,
      hideCopy: cleaned.length === 0,
    };
  }

  return { mainText: basePrompt, promptInstruction: '', prefixRemoved: false, hideCopy: false };
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
    // noop
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

function ImageAttachmentCard({ attachment, onOpen }: { attachment: AiHistoryAttachment; onOpen: (url: string) => void }) {
  const canView = Boolean(attachment.viewUrl) && !attachment.expired && !attachment.deleted;
  return (
    <div style={{ border: '1px solid var(--color-border, #ddd)', borderRadius: 8, padding: 10, marginTop: 8 }}>
      {canView ? (
        <img
          alt={attachment.originalName ?? 'history image'}
          src={attachment.viewUrl}
          style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 6, display: 'block' }}
        />
      ) : (
        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Image expired after retention window.</div>
      )}

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', opacity: 0.7 }}>
          {attachment.originalName ?? attachment.id} · {(attachment.sizeBytes / 1024).toFixed(0)} KB
        </span>
        {canView ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={() => onOpen(attachment.viewUrl!)} style={{ fontSize: '0.75rem' }} type="button">Open</button>
            <a className="btn-ghost" href={attachment.downloadUrl} style={{ fontSize: '0.75rem' }}>Download</a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AiRequestDetailModal({ id, onClose, exchangeRates }: Props) {
  const { prefs } = usePreferences();
  const [detail, setDetail] = useState<AiHistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setDetail(null);

    fetch(`/bff/history/${encodeURIComponent(id)}`)
      .then((r) => r.json() as Promise<FetchPayload>)
      .then((payload) => {
        if (cancelled) return;
        if (payload.ok) setDetail(payload.data);
        else setFetchError(payload.error.message);
      })
      .catch(() => { if (!cancelled) setFetchError('Failed to load detail.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  const parsed = detail ? parsePrompt(detail.promptContentJson, detail.promptExcerpt) : null;
  const imageAttachments = useMemo(
    () => (detail?.attachments ?? []).filter((a) => a.kind === 'image' && a.role === 'prompt'),
    [detail?.attachments],
  );
  const displayPromptResult = parsed
    ? getPromptInstructionAndQuestion(parsed, imageAttachments.length > 0)
    : { mainText: '', promptInstruction: '', prefixRemoved: false, hideCopy: false };
  const displayPrompt = displayPromptResult.mainText;
  const hasPromptText = displayPrompt.trim().length > 0;
  const hasPromptImages = imageAttachments.length > 0;
  const rawRequestText = detail?.promptContentJson == null
    ? ''
    : typeof detail.promptContentJson === 'string'
      ? detail.promptContentJson
      : JSON.stringify(detail.promptContentJson, null, 2);

  const rawResponseText = detail ? extractResponseText(detail.responseContentJson, detail.responseExcerpt) : '';
  const finalAnswer = detail ? extractFinalAnswer(detail.responseContentJson) : '';
  const displayResponse = finalAnswer || rawResponseText;

  return (
    <>
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
        <div style={{ background: 'var(--color-surface, #fff)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '760px', position: 'relative', boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }}>
          <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: '14px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, opacity: 0.5, padding: '0 4px' }}>×</button>

          <span className="micro-label">AI Request Detail</span>
          <h2 style={{ marginTop: '4px', marginBottom: '16px', paddingRight: '32px' }}>{detail?.model ?? (loading ? 'Loading…' : '—')}</h2>

          {loading && <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Loading…</p>}
          {fetchError && !loading && <div className="empty-state"><span className="micro-label">Error</span><p>{fetchError}</p></div>}

          {detail && !loading && (
            <>
              <div className="tag-row" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
                <span className={statusBadgeClass(detail.status)}>{detail.status}</span>
                <span className="tag-soft tag-soft--gray">{detail.requestType}</span>
                {detail.totalTokens > 0 && <span className="tag-soft tag-soft--gray">{detail.totalTokens} tokens</span>}
                {detail.estimatedCostUsd > 0 && (
                  <span className="tag-soft tag-soft--gray">{formatUsdAmountByPreference(detail.estimatedCostUsd, prefs.balanceDisplayCurrency, exchangeRates)}</span>
                )}
                {detail.durationMs != null && <span className="tag-soft tag-soft--gray">{detail.durationMs} ms</span>}
              </div>

              <div style={{ fontSize: '0.82rem', opacity: 0.65, marginBottom: '20px' }}>
                {formatUtcDateTime(detail.occurredAt)}
                {detail.errorCode ? ` · error: ${detail.errorCode}` : ''}
                {detail.fileMetadata ? ` · ${detail.fileMetadata.originalName} (${(detail.fileMetadata.sizeBytes / 1024).toFixed(0)} KB, ${detail.fileMetadata.mimeType})` : ''}
              </div>

              {(detail.promptTokens > 0 || detail.completionTokens > 0) && (
                <div style={{ fontSize: '0.78rem', opacity: 0.55, marginBottom: '20px' }}>
                  {detail.promptTokens} prompt tokens · {detail.completionTokens} completion tokens
                </div>
              )}

              <section style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="micro-label">Request / Question</span>
                  {hasPromptText && !displayPromptResult.hideCopy && (
                    <button className="btn-ghost" onClick={() => copyText(displayPrompt)} style={{ fontSize: '0.75rem', padding: '2px 8px' }} type="button">Copy</button>
                  )}
                </div>
                {hasPromptText ? <pre style={codeBlockStyle}>{displayPrompt}</pre> : null}
                {hasPromptImages && (
                  <div style={{ marginTop: 12 }}>
                    {imageAttachments.map((attachment) => (
                      <ImageAttachmentCard key={attachment.id} attachment={attachment} onOpen={setPreviewUrl} />
                    ))}
                  </div>
                )}
                {!hasPromptText && !hasPromptImages && <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: 0 }}>No prompt content available.</p>}
                {displayPromptResult.prefixRemoved && displayPromptResult.promptInstruction && (
                  <ExpandableSection label="Prompt instruction" content={displayPromptResult.promptInstruction} />
                )}
                {parsed?.systemText && <ExpandableSection label="System" content={parsed.systemText} />}
                {rawRequestText && <ExpandableSection label="Raw request" content={rawRequestText} />}
              </section>

              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="micro-label">Response</span>
                  {displayResponse && <button className="btn-ghost" onClick={() => copyText(displayResponse)} style={{ fontSize: '0.75rem', padding: '2px 8px' }} type="button">Copy</button>}
                </div>
                {displayResponse ? <pre style={codeBlockStyle}>{displayResponse}</pre> : <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: 0 }}>No response content available.</p>}
                {rawResponseText && <ExpandableSection label="Raw response" content={rawResponseText} />}
              </section>
            </>
          )}
        </div>
      </div>

      {previewUrl && (
        <div onClick={() => setPreviewUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img alt="Prompt image" src={previewUrl} style={{ maxWidth: '95vw', maxHeight: '92vh', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
