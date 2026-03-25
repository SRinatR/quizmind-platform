import Link from 'next/link';
import { AuthShell } from '../../../auth/auth-shell';
import { getSession } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';
import { ExtensionConnectClient } from './extension-connect-client';
import { parseBridgeConnectRequest, toSearchParams } from './bridge-connect-contract';

interface ExtensionConnectPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}


function buildCurrentPath(searchParams?: Record<string, string | string[] | undefined>) {
  const params = toSearchParams(searchParams);
  return params.size > 0 ? `/app/extension/connect?${params.toString()}` : '/app/extension/connect';
}

export default async function ExtensionConnectPage({ searchParams }: ExtensionConnectPageProps) {
  const resolvedSearchParams = await searchParams;
  const searchParamsList = toSearchParams(resolvedSearchParams);
  const parsedConnectRequest = parseBridgeConnectRequest(searchParamsList, {
    defaultEnvironment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  });
  const { initialRequest, targetOrigin, requestId, diagnostics } = parsedConnectRequest;
  const { missingFields } = diagnostics;

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
          diagnostics={diagnostics}
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
              Installation: <span className="monospace">{initialRequest?.installationId ?? 'missing'}</span>
            </p>
            <p>
              Version: <span className="monospace">{initialRequest?.handshake.extensionVersion ?? 'missing'}</span>
              {' '}| Schema: <span className="monospace">{initialRequest?.handshake.schemaVersion ?? 'missing'}</span>
            </p>
            <div className="tag-row">
              {(initialRequest?.handshake.capabilities ?? []).map((capability) => (
                <span className="tag" key={capability}>
                  {capability}
                </span>
              ))}
              {initialRequest?.handshake.browser ? <span className="tag warn">{initialRequest.handshake.browser}</span> : null}
            </div>
          </div>

          {missingFields.length > 0 ? (
            <div className="auth-highlight">
              <span className="micro-label">Missing parameters</span>
              <strong>The extension did not open the bridge with a full handshake.</strong>
              <p>Missing: {missingFields.join(', ')}</p>
              <p>Received query params: {diagnostics.receivedParams.join(', ') || 'none'}</p>
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
