'use client';

import {
  compatibilityStatuses,
  type CompatibilityRulePublishRequest,
  type CompatibilityRulePublishResult,
} from '@quizmind/contracts';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { type CompatibilityRulesStateSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

interface CompatibilityClientProps {
  initialState: CompatibilityRulesStateSnapshot;
  isConnectedSession: boolean;
}

interface RouteResponse {
  ok: boolean;
  data?: CompatibilityRulePublishResult;
  error?: {
    message?: string;
  };
}

function parseCsv(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function CompatibilityClient({ initialState, isConnectedSession }: CompatibilityClientProps) {
  const router = useRouter();
  const [minimumVersion, setMinimumVersion] = useState(initialState.items[0]?.minimumVersion ?? '1.4.0');
  const [recommendedVersion, setRecommendedVersion] = useState(initialState.items[0]?.recommendedVersion ?? '1.6.0');
  const [supportedSchemaVersions, setSupportedSchemaVersions] = useState(
    (initialState.items[0]?.supportedSchemaVersions ?? ['2']).join(', '),
  );
  const [requiredCapabilities, setRequiredCapabilities] = useState(
    (initialState.items[0]?.requiredCapabilities ?? ['quiz-capture']).join(', '),
  );
  const [resultStatus, setResultStatus] = useState(initialState.items[0]?.resultStatus ?? 'supported');
  const [reason, setReason] = useState(initialState.items[0]?.reason ?? '');
  const [statusMessage, setStatusMessage] = useState<string | null>(
    isConnectedSession
      ? 'Publish a compatibility rule to change how future extension bootstrap requests are evaluated.'
      : 'Persona mode can inspect recent compatibility rules. Connected admin auth is required to publish.',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startRefresh] = useTransition();

  async function publishRule() {
    if (!isConnectedSession) {
      setStatusMessage(null);
      setErrorMessage('Sign in with a connected admin session to publish a compatibility rule.');
      return;
    }

    setErrorMessage(null);
    setStatusMessage('Publishing compatibility rule...');

    const requestBody: CompatibilityRulePublishRequest = {
      minimumVersion: minimumVersion.trim(),
      recommendedVersion: recommendedVersion.trim(),
      supportedSchemaVersions: parseCsv(supportedSchemaVersions),
      requiredCapabilities: parseCsv(requiredCapabilities),
      resultStatus,
      reason: reason.trim() || null,
    };

    try {
      const response = await fetch('/bff/admin/compatibility/publish', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json().catch(() => null)) as RouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to publish the compatibility rule right now.');
        return;
      }

      setStatusMessage(`Published compatibility rule at ${formatUtcDateTime(payload.data.publishedAt)}.`);
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setStatusMessage(null);
      setErrorMessage('Unable to reach the compatibility publish route right now.');
    }
  }

  return (
    <div className="admin-feature-flags-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Draft rule</span>
          <h2>Publish a new compatibility verdict</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Minimum version</span>
              <input onChange={(event) => setMinimumVersion(event.target.value)} value={minimumVersion} />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Recommended version</span>
              <input onChange={(event) => setRecommendedVersion(event.target.value)} value={recommendedVersion} />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Supported schemas</span>
              <input onChange={(event) => setSupportedSchemaVersions(event.target.value)} value={supportedSchemaVersions} />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Required capabilities</span>
              <input onChange={(event) => setRequiredCapabilities(event.target.value)} value={requiredCapabilities} />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Result status</span>
              <select onChange={(event) => setResultStatus(event.target.value as typeof resultStatus)} value={resultStatus}>
                {compatibilityStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Reason</span>
              <textarea onChange={(event) => setReason(event.target.value)} rows={4} value={reason} />
            </label>
          </div>
          <div className="admin-user-actions">
            <button className="btn-primary" disabled={isPending} onClick={() => void publishRule()} type="button">
              {isPending ? 'Publishing...' : 'Publish rule'}
            </button>
          </div>
          <p className="admin-ticket-note">
            The newest compatibility rule becomes the control-plane verdict used by extension bootstrap.
          </p>
        </article>

        <article className="panel">
          <span className="micro-label">Current baseline</span>
          <h2>Latest active compatibility rule</h2>
          {initialState.items[0] ? (
            <div className="mini-list">
              <div className="list-item">
                <strong>Version gate</strong>
                <p>
                  min {initialState.items[0].minimumVersion} | recommended {initialState.items[0].recommendedVersion}
                </p>
              </div>
              <div className="list-item">
                <strong>Verdict</strong>
                <p>{initialState.items[0].resultStatus}</p>
              </div>
              <div className="list-item">
                <strong>Schemas</strong>
                <p>{initialState.items[0].supportedSchemaVersions.join(', ')}</p>
              </div>
              <div className="list-item">
                <strong>Capabilities</strong>
                <p>{initialState.items[0].requiredCapabilities?.join(', ') || 'No required capability gate.'}</p>
              </div>
              {initialState.items[0].reason ? (
                <div className="list-item">
                  <strong>Reason</strong>
                  <p>{initialState.items[0].reason}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p>No compatibility rules have been published yet.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">History</span>
        <h2>Recent compatibility rules</h2>
        {initialState.items.length > 0 ? (
          <div className="list-stack">
            {initialState.items.map((rule, index) => (
              <article className="list-item" key={rule.id}>
                <div className="billing-section-header">
                  <div>
                    <strong>{index === 0 ? 'Latest rule' : `Rule ${index + 1}`}</strong>
                    <p>
                      {rule.minimumVersion} to {rule.recommendedVersion} | published {formatUtcDateTime(rule.createdAt)}
                    </p>
                  </div>
                  <div className="tag-row">
                    <span className={index === 0 ? 'tag' : 'tag warn'}>{index === 0 ? 'active' : 'history'}</span>
                    <span className="tag">{rule.resultStatus}</span>
                  </div>
                </div>
                <p>
                  schemas {rule.supportedSchemaVersions.join(', ')} | capabilities{' '}
                  {rule.requiredCapabilities?.join(', ') || 'none'}
                </p>
                {rule.reason ? <p className="list-muted">{rule.reason}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p>No compatibility rules are visible in this environment yet.</p>
        )}
      </section>
    </div>
  );
}
