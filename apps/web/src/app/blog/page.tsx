import { SiteShell } from '../../components/site-shell';
import { BlogContentClient } from './blog-content-client';

export default function BlogPage() {
  return (
    <SiteShell
      apiState="Public blog"
      currentPersona="platform-admin"
      description="Engineering notes, release context, and implementation decisions from QuizMind platform delivery."
      eyebrow="Blog"
      pathname="/blog"
      showPersonaSwitcher={false}
      title="Product and engineering journal"
    >
      <BlogContentClient />
    </SiteShell>
  );
}
