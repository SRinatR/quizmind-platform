import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getExtensionInstallationInventory,
  getSession,
  resolvePersona,
} from '../../../lib/api';
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
  const inventory = workspaceId ? await getExtensionInstallationInventory(workspaceId, accessToken) : null;

  return (
    <SiteShell
      apiState={
        session ? (isConnectedSession ? `Connected ${sessionLabel}` : `Persona ${session.personaLabel}`) : 'API offline fallback'
      }
      currentPersona={persona}
      description="The dashboard now has a dedicated managed-client inventory for extension installations, active installation sessions, compatibility state, and reconnect controls."
      eyebrow="Installations"
      pathname="/app/installations"
      showPersonaSwitcher={!isConnectedSession}
      title="Extension installation inventory"
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
      ) : session ? (
        <section className="empty-state">
          <span className="micro-label">Installations</span>
          <h2>Installation inventory is not available for this workspace yet.</h2>
          <p>
            This usually means the workspace has no bound extension installations yet or your current session does not
            have installation read access.
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
