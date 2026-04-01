import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, getUsageSummary, resolvePersona } from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { UsagePageClient } from './usage-page-client';

interface UsagePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const session = await getSession(persona, accessToken);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const requestedWorkspaceId = readSearchParam(resolvedSearchParams?.workspaceId);
  const workspaceId =
    requestedWorkspaceId && session?.workspaces.some((w) => w.id === requestedWorkspaceId)
      ? requestedWorkspaceId
      : session?.workspaces[0]?.id;
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
      title="Workspace usage"
    >
      <UsagePageClient session={session} workspaceId={workspaceId} usage={usage} />
    </SiteShell>
  );
}
