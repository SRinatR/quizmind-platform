import { SiteShell } from '../../components/site-shell';
import { RoadmapContentClient } from './roadmap-content-client';

export default function RoadmapPage() {
  return (
    <SiteShell
      apiState="Public roadmap"
      currentPersona="platform-admin"
      description="Execution tracks for platform delivery with transparent status and linked operational surfaces."
      eyebrow="Roadmap"
      pathname="/roadmap"
      showPersonaSwitcher={false}
      title="Delivery tracks and milestones"
    >
      <RoadmapContentClient />
    </SiteShell>
  );
}
