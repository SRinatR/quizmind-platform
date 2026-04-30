'use client';

import { useEffect, useMemo, useState } from 'react';
import { type AiHistoryAttachment, type AiHistoryDetail } from '@quizmind/contracts';
import { buildHistoryPromptDisplay } from './history-prompt-display';
import { getReadableModelName } from './history-model-display';
import { formatHistoryDuration } from './history-duration';
import { formatUtcDateTime } from '../../../lib/datetime';
import type { ExchangeRateSnapshot } from '../../../lib/exchange-rates';
import { formatDisplayMoneyFromRubMinor, formatUsdAmountByPreference } from '../../../lib/money';
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
  background: 'var(--code-bg)',
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
  color: 'var(--code-ink)',
  border: '1px solid var(--line)',
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

function ImageAttachmentCard({
  attachment, onOpen, td,
}: { attachment: AiHistoryAttachment; onOpen: (url: string) => void; td: ReturnType<typeof usePreferences>['t']['aiRequestDetail'] }) {
  const canView = Boolean(attachment.viewUrl) && !attachment.expired && !attachment.deleted;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginTop: 8 }}>
      {canView ? (
        <img
          alt={attachment.originalName ?? td.historyImageAlt}
          src={attachment.viewUrl}
          style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 6, display: 'block' }}
        />
      ) : (
        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{td.imageExpired}</div>
      )}

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', opacity: 0.7 }}>
          {attachment.originalName ?? attachment.id} · {(attachment.sizeBytes / 1024).toFixed(0)} KB
        </span>
        {canView ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={() => onOpen(attachment.viewUrl!)} style={{ fontSize: '0.75rem' }} type="button">{td.open}</button>
            <a className="btn-ghost" href={attachment.downloadUrl} style={{ fontSize: '0.75rem' }}>{td.download}</a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AiRequestDetailModal({ id, onClose, exchangeRates }: Props) {
  const { prefs, t } = usePreferences();
  const td = t.aiRequestDetail;
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
      .catch(() => { if (!cancelled) setFetchError(td.failedLoad); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  const promptDisplay = useMemo(() => {
    if (!detail) {
      return {
        cleanQuestionText: '',
        promptInstructionText: undefined,
        systemText: undefined,
        hasImages: false,
        imageAttachments: [] as AiHistoryAttachment[],
        hasPromptText: false,
      };
    }

    return buildHistoryPromptDisplay({
      promptContentJson: detail.promptContentJson,
      promptExcerpt: detail.promptExcerpt,
      requestType: detail.requestType,
      attachments: detail.attachments,
    });
  }, [detail]);

  const displayPrompt = promptDisplay.cleanQuestionText;
  const hasPromptText = promptDisplay.hasPromptText;
  const hasPromptImages = promptDisplay.imageAttachments.length > 0;
  const rawRequestText = detail?.promptContentJson == null
    ? ''
    : typeof detail.promptContentJson === 'string'
      ? detail.promptContentJson
      : JSON.stringify(detail.promptContentJson, null, 2);

  const rawResponseText = detail ? extractResponseText(detail.responseContentJson, detail.responseExcerpt) : '';
  const finalAnswer = detail ? extractFinalAnswer(detail.responseContentJson) : '';
  const displayResponse = finalAnswer || rawResponseText;
  const formattedDuration = formatHistoryDuration(detail?.durationMs);
  const costMeta = useMemo(() => {
    if (!detail) return null;
    const hasChargedMinor = detail.chargedCurrency === 'RUB' && Number.isFinite(detail.chargedAmountMinor) && (detail.chargedAmountMinor ?? 0) > 0;
    const hasChargedUsd = Number.isFinite(detail.chargedCostUsd) && (detail.chargedCostUsd ?? 0) > 0;
    const estimatedCost = detail.estimatedCostUsd ?? detail.providerCostUsd ?? 0;
    const hasEstimatedUsd = Number.isFinite(estimatedCost) && estimatedCost > 0;
    if (hasChargedMinor) {
      return { label: td.chargedLabel, value: formatDisplayMoneyFromRubMinor({ amountMinor: detail.chargedAmountMinor!, displayCurrency: prefs.balanceDisplayCurrency, rates: exchangeRates }), billed: true };
    }
    if (hasChargedUsd) {
      return { label: td.chargedLabel, value: formatUsdAmountByPreference(detail.chargedCostUsd!, prefs.balanceDisplayCurrency, exchangeRates), billed: true };
    }
    if (hasEstimatedUsd) {
      return { label: td.approximateLabel, value: formatUsdAmountByPreference(estimatedCost, prefs.balanceDisplayCurrency, exchangeRates), billed: false };
    }
    return null;
  }, [detail, exchangeRates, prefs.balanceDisplayCurrency, td.approximateLabel, td.chargedLabel]);

  return (
    <>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--overlay-bg)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '40px 16px 60px',
          overflowY: 'auto',
        }}
      >
        <div style={{ background: 'var(--modal-bg)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '760px', position: 'relative', boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }}>
          <button aria-label={td.close} onClick={onClose} style={{ position: 'absolute', top: '14px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, opacity: 0.5, padding: '0 4px' }}>×</button>

          <span className="micro-label">{td.title}</span>
          <h2 style={{ marginTop: '4px', marginBottom: '16px', paddingRight: '32px' }}>{detail ? getReadableModelName(detail.model) : (loading ? td.loading : '—')}</h2>

          {loading && <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>{td.loading}</p>}
          {fetchError && !loading && <div className="empty-state"><span className="micro-label">{td.error}</span><p>{fetchError}</p></div>}

          {detail && !loading && (
            <>
              <div className="tag-row" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
                <span className={statusBadgeClass(detail.status)}>{detail.status}</span>
                <span className="tag-soft tag-soft--gray">{detail.requestType}</span>
                {detail.totalTokens > 0 && <span className="tag-soft tag-soft--gray">{detail.totalTokens} {td.tokens}</span>}
                {formattedDuration != null && <span className="tag-soft tag-soft--gray">{formattedDuration}</span>}
                {costMeta && (
                  <span className={costMeta.billed ? 'ai-detail-price-chip ai-detail-price-chip--charged' : 'ai-detail-price-chip ai-detail-price-chip--approximate'}>
                    {costMeta.label} {costMeta.value}
                  </span>
                )}
              </div>

              <div style={{ fontSize: '0.82rem', opacity: 0.65, marginBottom: '20px' }}>
                {formatUtcDateTime(detail.occurredAt)}
                {detail.errorCode ? ` · error: ${detail.errorCode}` : ''}
                {detail.fileMetadata ? ` · ${detail.fileMetadata.originalName} (${(detail.fileMetadata.sizeBytes / 1024).toFixed(0)} KB, ${detail.fileMetadata.mimeType})` : ''}
              </div>

              {(detail.promptTokens > 0 || detail.completionTokens > 0) && (
                <div style={{ fontSize: '0.78rem', opacity: 0.55, marginBottom: '20px' }}>
                  {detail.promptTokens} {td.promptTokens} · {detail.completionTokens} {td.completionTokens}
                </div>
              )}

              <section style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="micro-label">{td.requestQuestion}</span>
                  {hasPromptText && (
                    <button className="btn-ghost" onClick={() => copyText(displayPrompt)} style={{ fontSize: '0.75rem', padding: '2px 8px' }} type="button">{td.copy}</button>
                  )}
                </div>
                {hasPromptText ? <pre style={codeBlockStyle}>{displayPrompt}</pre> : null}
                {hasPromptImages && (
                  <div style={{ marginTop: 12 }}>
                    {promptDisplay.imageAttachments.map((attachment) => (
                      <ImageAttachmentCard key={attachment.id} attachment={attachment} onOpen={setPreviewUrl} td={td} />
                    ))}
                  </div>
                )}
                {!hasPromptText && !hasPromptImages && <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: 0 }}>{td.noPrompt}</p>}
                {promptDisplay.promptInstructionText && (
                  <ExpandableSection label={td.promptInstruction} content={promptDisplay.promptInstructionText} />
                )}
                {promptDisplay.systemText && <ExpandableSection label={td.system} content={promptDisplay.systemText} />}
                {rawRequestText && <ExpandableSection label={td.rawRequest} content={rawRequestText} />}
              </section>

              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="micro-label">{td.response}</span>
                  {displayResponse && <button className="btn-ghost" onClick={() => copyText(displayResponse)} style={{ fontSize: '0.75rem', padding: '2px 8px' }} type="button">{td.copy}</button>}
                </div>
                {displayResponse ? <pre style={codeBlockStyle}>{displayResponse}</pre> : <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: 0 }}>{td.noResponse}</p>}
                {rawResponseText && <ExpandableSection label={td.rawResponse} content={rawResponseText} />}
              </section>
            </>
          )}
        </div>
      </div>

      {previewUrl && (
        <div onClick={() => setPreviewUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img alt={td.promptImageAlt} src={previewUrl} style={{ maxWidth: '95vw', maxHeight: '92vh', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
