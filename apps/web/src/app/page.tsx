import Link from 'next/link';

import { SiteShell } from '../components/site-shell';
import { getFoundation, getHealth, personaHref } from '../lib/api';

export default async function HomePage() {
  const [foundation, health] = await Promise.all([getFoundation(), getHealth()]);
  const apiState = health
    ? `API ${health.status} · ${health.runtime.runtimeMode}`
    : 'API offline fallback';

  return (
    <SiteShell
      apiState={apiState}
      currentPersona="platform-admin"
      description="QuizMind now boots as a real monorepo foundation: Nest API, Next app, worker runtime, RBAC-aware sections, billing primitives, and remote-config control plane."
      eyebrow="Foundation Stage"
      pathname="/"
      title="One platform for landing, app, admin, and extension control."
    >
      <section className="metrics-grid">
        <article className="stat-card">
          <p className="stat-value">{foundation?.modules.length ?? 12}</p>
          <span className="stat-label">Backend modules planned from day one</span>
        </article>
        <article className="stat-card">
          <p className="stat-value">{foundation?.routes.length ?? 10}</p>
          <span className="stat-label">API routes wired into the foundation surface</span>
        </article>
        <article className="stat-card">
          <p className="stat-value">{foundation?.queues.length ?? 7}</p>
          <span className="stat-label">Queue channels ready for worker orchestration</span>
        </article>
        <article className="stat-card">
          <p className="stat-value">{Object.keys(foundation?.schemas ?? {}).length || 6}</p>
          <span className="stat-label">Schema groups covering auth, billing, control-plane, and logs</span>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Start Package</span>
          <h2>What this scaffold now covers</h2>
          <div className="list-stack">
            {(foundation?.foundationTracks ?? []).map((track) => (
              <div className="list-item" key={track.id}>
                <strong>{track.title}</strong>
                <p>{track.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Quick Launch</span>
          <h2>Open the main surfaces</h2>
          <p>
            The landing page is this route. The dashboard and admin areas read their data from the Nest API
            and switch behavior by demo persona.
          </p>
          <div className="command-row">
            <Link className="command-chip monospace" href={personaHref('/app', 'platform-admin')}>
              /app?persona=platform-admin
            </Link>
            <Link className="command-chip monospace" href={personaHref('/admin', 'support-admin')}>
              /admin?persona=support-admin
            </Link>
            <Link className="command-chip monospace" href={personaHref('/admin', 'workspace-viewer')}>
              /admin?persona=workspace-viewer
            </Link>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Foundation Signals</span>
          <h2>Runtime and control-plane posture</h2>
          <div className="mini-list">
            <div className="list-item">
              <strong>{foundation?.frameworks.api ?? 'NestJS'} API</strong>
              <span className="list-muted">Auth, workspace, billing, remote config, support, and health.</span>
            </div>
            <div className="list-item">
              <strong>{foundation?.frameworks.web ?? 'Next.js'} Web</strong>
              <span className="list-muted">Landing + /app + /admin with RBAC-aware rendering.</span>
            </div>
            <div className="list-item">
              <strong>{foundation?.frameworks.worker ?? 'Worker runtime'}</strong>
              <span className="list-muted">Dry-run friendly queues for local startup without external infra.</span>
            </div>
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Commands</span>
          <h2>Workspace entrypoints</h2>
          <div className="command-row">
            <span className="command-chip monospace">pnpm install</span>
            <span className="command-chip monospace">pnpm typecheck</span>
            <span className="command-chip monospace">pnpm dev</span>
          </div>
          <p className="metric-copy">
            `pnpm dev` starts the three apps together: Next on port 3000, Nest on port 4000, and the worker
            heartbeat runtime.
          </p>
        </article>
      </section>
    </SiteShell>
  );
}
