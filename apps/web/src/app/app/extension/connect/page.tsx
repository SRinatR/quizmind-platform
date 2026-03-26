import Link from 'next/link';
import {
  type CompatibilityHandshake,
  type ExtensionInstallationBindRequest,
} from '@quizmind/contracts';

import { AuthShell } from '../../../auth/auth-shell';
import { readSearchParam } from '../../../auth/search-params';
import { getSession } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';
import { ExtensionConnectClient } from './extension-connect-client';

interface ExtensionConnectPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const validBrowsers = new Set<CompatibilityHandshake['browser']>(['chrome', 'edge', 'brave', 'other']);

function readTrimmedSearchParam(value: string | string[] | undefined): string | undefined {
  const normalized = readSearchParam(value)?.trim();

  return normalized ? normalized : undefined;
}

function readStringListSearchParam(value: string | string[] | undefined): string[] {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];

  return Array.from(
    new Set(
      rawValues
        .flatMap((item) => item.split(','))
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function readBrowserSearchParam(value: string | string[] | undefined): CompatibilityHandshake['browser'] | undefined {
  const normalized = readTrimmedSearchParam(value);

  if (!normalized || !validBrowsers.has(normalized as CompatibilityHandshake['browser'])) {
    return undefined;
  }

  return normalized as CompatibilityHandshake['browser'];
}

function buildCurrentPath(searchParams?: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry) {
          params.append(key, entry);
        }
      });
      continue;
    }

    if (value) {
      params.set(key, value);
    }
  }

  return params.size > 0 ? `/app/extension/connect?${params.toString()}` : '/app/extension/connect';
}

export default async function ExtensionConnectPage({ searchParams }: ExtensionConnectPageProps) {
  const resolvedSearchParams = await searchParams;
  const installationId = readTrimmedSearchParam(resolvedSearchParams?.installationId);
  const workspaceId = readTrimmedSearchParam(resolvedSearchParams?.workspaceId);
  const extensionVersion = readTrimmedSearchParam(resolvedSearchParams?.extensionVersion);
  const buildId = readTrimmedSearchParam(resolvedSearchParams?.buildId);
  const schemaVersion = readTrimmedSearchParam(resolvedSearchParams?.schemaVersion);
  const browser = readBrowserSearchParam(resolvedSearchParams?.browser);
  const environment =
    readTrimmedSearchParam(resolvedSearchParams?.environment) ??
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  const targetOrigin = readTrimmedSearchParam(resolvedSearchParams?.targetOrigin);
  const bridgeNonce = readTrimmedSearchParam(resolvedSearchParams?.bridgeNonce);
  const requestId = readTrimmedSearchParam(resolvedSearchParams?.requestId);
  const capabilities = Array.from(
    new Set([
      ...readStringListSearchParam(resolvedSearchParams?.capabilities),
      ...readStringListSearchParam(resolvedSearchParams?.capability),
    ]),
  );

  const missingFields = [
    ...(!installationId ? ['installationId'] : []),
    ...(!extensionVersion ? ['extensionVersion'] : []),
    ...(!schemaVersion ? ['schemaVersion'] : []),
    ...(capabilities.length === 0 ? ['capabilities'] : []),
    ...(!browser ? ['browser'] : []),
  ];
  const initialRequest: ExtensionInstallationBindRequest | null =
    missingFields.length === 0 && installationId && extensionVersion && schemaVersion && browser
      ? {
          installationId,
          environment,
          handshake: {
            extensionVersion,
            schemaVersion,
            capabilities,
            browser,
            ...(buildId ? { buildId } : {}),
          },
          ...(workspaceId ? { workspaceId } : {}),
        }
      : null;

  const accessToken = await getAccessTokenFromCookies();
  const session = accessToken ? await getSession('platform-admin', accessToken) : null;
  const nextPath = buildCurrentPath(resolvedSearchParams);
  const loginHref = `/auth/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <AuthShell
      description="This bridge binds a browser extension installation to the current site session without exposing the raw user bearer token to the extension runtime."
      eyebrow="Extension Connect"
      highlights={[
        {
          eyebrow: 'Session boundary',
          title: 'Web keeps the cookie-backed auth session',
          description: 'The site reads HttpOnly cookies server-side and exchanges them for a short-lived installation token.',
        },
        {
          eyebrow: 'Managed client',
          title: 'The extension gets only installation-scoped auth',
          description: 'After bind, the extension uses installation auth for bootstrap refresh and usage telemetry.',
        },
        {
          eyebrow: 'Bootstrap source',
          title: 'Compatibility, flags, config, and AI policy come from platform',
          description: 'The extension should treat bootstrap v2 as the live control-plane payload and cache only the last known state.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to landing' },
        { href: '/app', label: 'Open dashboard' },
        { href: '/app/settings', label: 'Open settings' },
      ]}
      title="Securely connect the extension"
    >
      {session ? (
        <ExtensionConnectClient
          currentUserLabel={session.user.displayName || session.user.email}
          initialRequest={initialRequest}
          missingFields={missingFields}
          bridgeNonce={bridgeNonce}
          requestId={requestId}
          targetOrigin={targetOrigin}
          workspaces={session.workspaces}
        />
      ) : (
        <div className="auth-form-shell">
          <span className="micro-label">Sign in required</span>
          <h2>Open a connected site session first.</h2>
          <p className="auth-form-copy">
            The extension bridge can bind an installation only for an authenticated platform user. Sign in on the
            site, then reopen this bridge from the extension.
          </p>

          <div className="auth-session-card">
            <strong>Incoming handshake</strong>
            <p>
              Installation: <span className="monospace">{installationId ?? 'missing'}</span>
            </p>
            <p>
              Version: <span className="monospace">{extensionVersion ?? 'missing'}</span>
              {' '}| Schema: <span className="monospace">{schemaVersion ?? 'missing'}</span>
            </p>
            <div className="tag-row">
              {capabilities.map((capability) => (
                <span className="tag" key={capability}>
                  {capability}
                </span>
              ))}
              {browser ? <span className="tag warn">{browser}</span> : null}
            </div>
          </div>

          {missingFields.length > 0 ? (
            <div className="auth-highlight">
              <span className="micro-label">Missing parameters</span>
              <strong>The extension did not open the bridge with a full handshake.</strong>
              <p>{missingFields.join(', ')}</p>
            </div>
          ) : null}

          <div className="auth-form-actions">
            <Link className="btn-primary" href={loginHref}>
              Sign in and continue
            </Link>
            <Link className="btn-ghost" href="/auth/login">
              Open login
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
