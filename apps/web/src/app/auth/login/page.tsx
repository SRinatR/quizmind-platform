import { SiteShell } from '../../../components/site-shell';

export default function LoginPage() {
  return (
    <SiteShell
      apiState="Demo auth"
      currentPersona="platform-admin"
      description="The login form is intentionally mocked for the foundation pass. Persona changes are driven by sample emails and query params."
      eyebrow="Auth"
      pathname="/auth/login"
      title="Login scaffold"
    >
      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Demo Emails</span>
          <h2>Use these identities when wiring a real auth flow</h2>
          <div className="list-stack">
            <div className="list-item">
              <strong>admin@quizmind.dev</strong>
              <p>Maps to `platform-admin`.</p>
            </div>
            <div className="list-item">
              <strong>support@quizmind.dev</strong>
              <p>Maps to `support-admin`.</p>
            </div>
            <div className="list-item">
              <strong>viewer@quizmind.dev</strong>
              <p>Maps to `workspace-viewer`.</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Next Step</span>
          <h2>Replace the mock with real sessions</h2>
          <p>
            The API already exposes `/auth/login` and `/auth/me`; the next implementation pass can swap demo
            personas for Nest auth guards and persistent session storage.
          </p>
        </article>
      </section>
    </SiteShell>
  );
}
