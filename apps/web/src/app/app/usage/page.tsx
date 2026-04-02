import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, getUsageSummary, resolvePersona } from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { UsagePageClient } from './usage-page-client';

interface UsagePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  // workspaceId resolved internally from session — compatibility layer, not exposed in UI
  const workspaceId = session?.workspaces[0]?.id;
  const usage = workspaceId ? await getUsageSummary(persona, workspaceId, accessToken) : null;
  const isAdmin = session ? isAdminSession(session) : false;

  return (
    <SiteShell
      apiState={session ? `Connected \u2014 ${sessionLabel}` : 'Not signed in'}
      currentPersona={persona}
      description=""
      eyebrow="Usage"
      isAdmin={isAdmin}
      isSignedIn={Boolean(session)}
      pathname="/app/usage"
      showPersonaSwitcher={false}
      title="Account usage"
      userDisplayName={session?.user.displayName ?? undefined}
    >
      <UsagePageClient session={session} usage={usage} />
    </SiteShell>
  );
}
