import Link from 'next/link';
import {
  type CompatibilityHandshake,
  type ExtensionInstallationBindRequest,
} from '@quizmind/contracts';

import { AuthShell } from '../../../auth/auth-shell';
import { readSearchParam } from '../../../auth/search-params';
import { getSession } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';
import { WEB_ENV } from '../../../../lib/web-env';
import {
  normalizeHttpOriginSearchParam,
  readStringListSearchParam,
  resolveAuthMode,
  resolvePlatformOriginValidation,
  resolveStrictPlatformOriginMode,
} from './connect-query';
import { ExtensionConnectClient } from './extension-connect-client';

interface ExtensionConnectPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const validBrowsers = new Set<CompatibilityHandshake['browser']>([
  'chrome',
  'edge',
  'brave',
  'firefox',
  'safari',
  'other',
]);

function readTrimmedSearchParam(value: string | string[] | undefined): string | undefined {
  const normalized = readSearchParam(value)?.trim();
  return normalized ? normalized : undefined;
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
        if (entry) params.append(key, entry);
      });
      continue;
    }
    if (value) params.set(key, value);
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
    (WEB_ENV.nodeEnv === 'production' ? 'production' : 'development');
  const targetOrigin = readTrimmedSearchParam(resolvedSearchParams?.targetOrigin);
  const bridgeNonce = readTrimmedSearchParam(resolvedSearchParams?.bridgeNonce);
  const requestId = readTrimmedSearchParam(resolvedSearchParams?.requestId);
  const bridgeMode = readTrimmedSearchParam(resolvedSearchParams?.bridgeMode);
  const relayUrl = readTrimmedSearchParam(resolvedSearchParams?.relayUrl);
  const platformOrigin = normalizeHttpOriginSearchParam(resolvedSearchParams?.platformOrigin);
  const configuredPlatformOrigin = normalizeHttpOriginSearchParam(WEB_ENV.appUrl);
  const strictPlatformOriginMode = resolveStrictPlatformOriginMode(
    WEB_ENV.extensionStrictPlatformOriginRaw,
    WEB_ENV.nodeEnv,
  );
  const platformOriginValidation = resolvePlatformOriginValidation({
    declaredPlatformOrigin: platformOrigin,
    configuredPlatformOrigin,
    strictMode: strictPlatformOriginMode,
  });
  const authMode = resolveAuthMode(resolvedSearchParams?.mode);
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
  const session = accessToken ? await getSession('connected-user', accessToken) : null;
  const nextPath = buildCurrentPath(resolvedSearchParams);
  const loginHref = `/auth/login?next=${encodeURIComponent(nextPath)}`;
  const registerHref = `/auth/register?next=${encodeURIComponent(nextPath)}`;
  const primaryAuthHref = authMode === 'signup' ? registerHref : loginHref;
  const secondaryAuthHref = authMode === 'signup' ? loginHref : registerHref;
  const primaryAuthLabel = authMode === 'signup' ? 'Create account and continue' : 'Sign in and continue';
  const secondaryAuthLabel = authMode === 'signup' ? 'Already have an account?' : 'Create account';

  return (
    <AuthShell
      description="Sign in to link your browser extension to your QuizMind account."
      eyebrow="Extension setup"
      highlights={[
        {
          eyebrow: 'Secure',
          title: 'Your credentials stay protected',
          description: 'The extension never receives your password or full account token — only a limited installation key.',
        },
        {
          eyebrow: 'Quick',
          title: 'One-time setup',
          description: 'Connect once and the extension stays linked to your workspace automatically.',
        },
        {
          eyebrow: 'Flexible',
          title: 'Works across browsers',
          description: 'Chrome, Edge, Brave, Firefox, and Safari are all supported.',
        },
      ]}
      links={[
        { href: '/', label: 'Back to home' },
        { href: '/app', label: 'Dashboard' },
        { href: '/app/settings', label: 'Settings' },
      ]}
      title="Connect your extension."
    >
      {session ? (
        <ExtensionConnectClient
          currentUserLabel={session.user.displayName || session.user.email}
          initialRequest={initialRequest}
          missingFields={missingFields}
          bridgeNonce={bridgeNonce}
          bridgeMode={bridgeMode}
          platformOriginWarning={platformOriginValidation.warning}
          platformOriginSecurityIssue={platformOriginValidation.securityIssue}
          relayUrl={relayUrl}
          requestId={requestId}
          targetOrigin={targetOrigin}
          workspaces={session.workspaces}
        />
      ) : (
        <div className="auth-form-shell">
          <span className="micro-label">Sign in required</span>
          <h2>Sign in to connect your extension.</h2>
          <p className="auth-form-copy">
            You need a QuizMind account to link your browser extension. Sign in or create an account, then
            reopen this page from the extension.
          </p>

          {platformOriginValidation.securityIssue ? (
            <div className="auth-highlight">
              <span className="micro-label">Security notice</span>
              <strong>This connection request could not be verified.</strong>
              <p>{platformOriginValidation.securityIssue}</p>
            </div>
          ) : platformOriginValidation.warning ? (
            <div className="auth-highlight">
              <span className="micro-label">Notice</span>
              <strong>Connection origin mismatch.</strong>
              <p>{platformOriginValidation.warning}</p>
            </div>
          ) : null}

          {missingFields.length > 0 ? (
            <div className="auth-highlight">
              <span className="micro-label">Incomplete request</span>
              <strong>The extension did not send a complete handshake.</strong>
              <p>Please reopen this page directly from the extension.</p>
            </div>
          ) : null}

          <div className="auth-form-actions">
            <Link className="btn-primary" href={primaryAuthHref}>
              {primaryAuthLabel}
            </Link>
            <Link className="btn-ghost" href={secondaryAuthHref}>
              {secondaryAuthLabel}
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
