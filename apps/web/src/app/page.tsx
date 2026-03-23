import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="lp-root">
      {/* ── Navigation ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <span className="lp-brand">QuizMind</span>
          <div className="lp-nav-links">
            <Link href="/features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/faq">FAQ</Link>
          </div>
          <div className="lp-nav-actions">
            <Link href="/auth/login" className="btn-ghost">Sign in</Link>
            <Link href="/auth/login" className="btn-primary">Get started</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <span className="lp-badge">Chrome Extension</span>
          <h1 className="lp-hero-title">
            Ace every quiz<br />with AI
          </h1>
          <p className="lp-hero-sub">
            QuizMind reads the question, finds the answer, and explains
            it — right inside your browser. Built for students,
            professionals, and lifelong learners.
          </p>
          <div className="lp-hero-actions">
            <a
              href="https://chrome.google.com/webstore"
              className="btn-primary btn-lg"
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to Chrome — it&apos;s free
            </a>
            <Link href="/app" className="btn-ghost btn-lg">
              Open dashboard →
            </Link>
          </div>
          <p className="lp-hero-note">
            No credit card required · Works on 500+ quiz platforms
          </p>
        </div>

        {/* Extension popup mockup */}
        <div className="lp-hero-visual">
          <div className="ext-mockup">
            <div className="ext-titlebar">
              <div className="ext-dots">
                <span className="ext-dot" />
                <span className="ext-dot ext-dot-amber" />
                <span className="ext-dot ext-dot-green" />
              </div>
              <span className="ext-title">QuizMind</span>
            </div>
            <div className="ext-body">
              <div className="ext-question-block">
                <span className="ext-chip">Question detected</span>
                <p className="ext-question-text">
                  What is the powerhouse of the cell?
                </p>
              </div>
              <div className="ext-answer-block">
                <span className="ext-chip ext-chip-green">Answer</span>
                <p className="ext-answer-text">
                  <strong>Mitochondria</strong> — the organelle responsible
                  for producing ATP through cellular respiration. It has a
                  double membrane structure with inner folds called cristae.
                </p>
              </div>
              <div className="ext-footer-bar">
                <span className="ext-tag">Biology</span>
                <span className="ext-tag">Cell structure</span>
                <span className="ext-confidence">98% confidence</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-section lp-features">
        <div className="lp-section-inner">
          <span className="lp-section-label">Features</span>
          <h2 className="lp-section-title">Everything you need to learn faster</h2>
          <div className="lp-features-grid">
            {FEATURES.map((f) => (
              <article className="lp-feature-card" key={f.title}>
                <div className="lp-feature-icon" aria-hidden="true">
                  {f.icon}
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lp-section lp-how">
        <div className="lp-section-inner">
          <span className="lp-section-label">How it works</span>
          <h2 className="lp-section-title">Three steps to the answer</h2>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div className="lp-step" key={s.title}>
                <div className="lp-step-num">{i + 1}</div>
                <div className="lp-step-body">
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-section lp-pricing">
        <div className="lp-section-inner">
          <span className="lp-section-label">Pricing</span>
          <h2 className="lp-section-title">Simple, honest pricing</h2>
          <p className="lp-pricing-sub">Start free. Upgrade when you need more.</p>
          <div className="lp-pricing-grid">
            {/* Free plan */}
            <div className="lp-plan">
              <div className="lp-plan-header">
                <span className="lp-plan-name">Free</span>
                <div className="lp-plan-price">
                  $0<span className="lp-plan-period">/month</span>
                </div>
              </div>
              <ul className="lp-plan-features">
                <li>25 answers per day</li>
                <li>Text questions</li>
                <li>Basic explanations</li>
                <li>Chrome extension</li>
                <li className="lp-plan-feature-disabled">Screenshot mode</li>
                <li className="lp-plan-feature-disabled">History sync</li>
              </ul>
              <Link href="/auth/login" className="btn-outline btn-block">
                Get started free
              </Link>
            </div>

            {/* Pro plan */}
            <div className="lp-plan lp-plan-pro">
              <div className="lp-plan-badge">Most popular</div>
              <div className="lp-plan-header">
                <span className="lp-plan-name">Pro</span>
                <div className="lp-plan-price">
                  $9<span className="lp-plan-period">/month</span>
                </div>
              </div>
              <ul className="lp-plan-features">
                <li>500 answers per day</li>
                <li>Text + screenshot questions</li>
                <li>Deep explanations</li>
                <li>Chrome extension</li>
                <li>Full history & sync</li>
                <li>Remote config for teams</li>
              </ul>
              <Link href="/auth/login" className="btn-primary btn-block">
                Start free trial
              </Link>
              <p className="lp-plan-note">14 days free, no card required</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-section-inner lp-cta-inner">
          <h2>Ready to learn smarter?</h2>
          <p>
            Join thousands of students and professionals using QuizMind
            every day.
          </p>
          <a
            href="https://chrome.google.com/webstore"
            className="btn-primary btn-lg"
            target="_blank"
            rel="noopener noreferrer"
          >
            Add to Chrome — it&apos;s free
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span className="lp-brand">QuizMind</span>
          <div className="lp-footer-links">
            <Link href="/features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/auth/login">Sign in</Link>
            <Link href="/app?persona=platform-admin">Dashboard</Link>
          </div>
          <span className="lp-footer-copy">© 2025 QuizMind</span>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: '⚡',
    title: 'Instant answers',
    desc: 'Get an answer in under a second, right where you need it — no tab switching.',
  },
  {
    icon: '📸',
    title: 'Screenshot mode',
    desc: 'Capture any visual question — diagrams, charts, equations, images.',
  },
  {
    icon: '📚',
    title: 'Deep explanations',
    desc: 'Not just the answer — understand the why behind every result.',
  },
  {
    icon: '🔄',
    title: 'History & sync',
    desc: 'Your questions and answers sync across all your devices automatically.',
  },
  {
    icon: '🔒',
    title: 'Private by default',
    desc: 'Your questions never leave without your explicit permission.',
  },
  {
    icon: '⚙️',
    title: 'Team config',
    desc: 'Workspace admins can push settings and model policies to the whole team.',
  },
];

const STEPS = [
  {
    title: 'Encounter a question',
    desc: 'Highlight text on any quiz, form, or exercise — or take a screenshot of a visual question.',
  },
  {
    title: 'QuizMind analyses it',
    desc: 'The extension sends it to our AI engine, resolves context, and picks the best answer.',
  },
  {
    title: 'Get answer + context',
    desc: 'See the full answer with a clear explanation overlaid directly on the page.',
  },
];