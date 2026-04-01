import { SiteShell } from '../../components/site-shell';
import { ChangelogContentClient } from './changelog-content-client';

export default function ChangelogPage() {
  return (
    <SiteShell
      apiState="Public release feed"
      currentPersona="platform-admin"
      description="Chronological release notes for platform, dashboard, billing, and extension integration work."
      eyebrow="Changelog"
      pathname="/changelog"
      showPersonaSwitcher={false}
      title="Platform shipping timeline"
    >
      <ChangelogContentClient />
    </SiteShell>
  );
}
