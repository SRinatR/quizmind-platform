import Link from 'next/link';

import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import {
  getExtensionInstallationInventory,
  getSession,
  getUserProfile,
  resolvePersona,
} from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { InstallationsPageClient } from './installations-page-client';

interface InstallationsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InstallationsPage({ searchParams }: InstallationsPageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const [inventory, userProfile] = await Promise.all([
    accessToken ? getExtensionInstallationInventory(accessToken) : Promise.resolve(null),
    getUserProfile(accessToken),
  ]);
  const isAdmin = session ? isAdminSession(session) : false;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Installations"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app/installations"
      showPersonaSwitcher={false}
      title="Extension installations"
      userDisplayName={session?.user.displayName ?? undefined}
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      {session && inventory ? (
        <InstallationsPageClient snapshot={inventory} />
      ) : session ? (
        <section className="empty-state">
          <span className="micro-label">Installations</span>
          <h2>No extension installations found yet.</h2>
          <p>
            No extension installations are bound to your account yet, or your session does not have
            installation read access.
          </p>
          <div className="link-row">
            <Link className="btn-ghost" href="/app/usage">Open usage</Link>
            <Link className="btn-ghost" href="/app/settings">Open settings</Link>
          </div>
        </section>
      ) : (
        <section className="empty-state">
          <span className="micro-label">Sign in</span>
          <h2>Open a connected session to manage extension installations.</h2>
          <p>Installation inventory, disconnect controls, and reconnect guidance require an authenticated session.</p>
          <div className="link-row">
            <Link className="btn-primary" href="/auth/login?next=/app/installations">Sign in</Link>
          </div>
        </section>
      )}
    </SiteShell>
  );
}
