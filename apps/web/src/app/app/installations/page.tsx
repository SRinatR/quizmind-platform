import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getExtensionInstallationInventory,
  getSession,
  resolvePersona,
} from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { InstallationsPageClient } from './installations-page-client';

interface InstallationsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function InstallationsPage({ searchParams }: InstallationsPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const isConnectedSession = session?.personaKey === 'connected-user';
  const sessionLabel = session?.user.displayName || session?.user.email;
  const requestedWorkspaceId = readSearchParam(resolvedSearchParams?.workspaceId);
  const workspaceId =
    requestedWorkspaceId && session?.workspaces.some((workspace) => workspace.id === requestedWorkspaceId)
      ? requestedWorkspaceId
      : session?.workspaces[0]?.id;
  const inventory = accessToken && workspaceId ? await getExtensionInstallationInventory(workspaceId, accessToken) : null;
  const isAdmin = session ? isAdminSession(session) : false;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Installations"
      isAdmin={isAdmin}
      pathname="/app/installations"
      showPersonaSwitcher={false}
      title="Extension installations"
    >
      {session && inventory ? (
        <>
          {session.workspaces.length > 1 ? (
            <section className="panel">
              <span className="micro-label">Workspace scope</span>
              <h2>Select the workspace installation fleet</h2>
              <div className="link-row">
                {session.workspaces.map((workspace) => (
                  <Link
                    className={workspace.id === inventory.workspace.id ? 'btn-primary' : 'btn-ghost'}
                    href={`/app/installations?workspaceId=${workspace.id}`}
                    key={workspace.id}
                  >
                    {workspace.name}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <InstallationsPageClient snapshot={inventory} />
        </>
      ) : session && workspaceId ? (
        <section className="empty-state">
          <span className="micro-label">Installations</span>
          <h2>No extension installations found yet.</h2>
          <p>
            The workspace has no bound extension installations yet, or your session does not have installation read
            access.
          </p>
          <div className="link-row">
            <Link className="btn-ghost" href="/app/usage">
              Open usage
            </Link>
            <Link className="btn-ghost" href="/app/settings">
              Open settings
            </Link>
          </div>
        </section>
      ) : session ? (
        <section className="empty-state">
          <span className="micro-label">No workspace</span>
          <h2>No workspace linked to your account yet.</h2>
          <p>
            Your session is active but your account is not yet linked to a workspace.
            Contact your administrator to get access.
          </p>
          <div className="link-row">
            <Link className="btn-ghost" href="/app/settings">
              View settings
            </Link>
          </div>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in</span>
          <h2>Open a connected session to manage extension installations.</h2>
          <p>Installation inventory, disconnect controls, and reconnect guidance require an authenticated dashboard session.</p>
        </section>
      )}
    </SiteShell>
  );
}



