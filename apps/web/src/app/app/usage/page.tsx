import { SiteShell } from '../../../components/site-shell';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { getSession, getUsageSummary, getUserProfile, resolvePersona } from '../../../lib/api';
import { isAdminSession } from '../../../lib/admin-guard';
import { UsagePageClient } from './usage-page-client';

interface UsagePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const resolvedSearchParams = await searchParams;
  const persona = resolvePersona(resolvedSearchParams);
  const accessToken = await getAccessTokenFromCookies();
  const [session, userProfile] = await Promise.all([
    getSession(persona, accessToken),
    getUserProfile(accessToken),
  ]);
  const sessionLabel = session?.user.displayName || session?.user.email;
  const usage = await getUsageSummary(persona, accessToken);
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
      userAvatarUrl={userProfile?.avatarUrl ?? undefined}
    >
      <UsagePageClient session={session} usage={usage} />
    </SiteShell>
  );
}
