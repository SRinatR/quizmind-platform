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
            <Link href="/docs">Docs</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/faq">FAQ</Link>
          </div>
          <div className="lp-nav-actions">
            <Link href="/auth/login" className="btn-ghost">Sign in</Link>
            <Link href="/auth/login" className="btn-primary">Get started free</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <span className="lp-badge">Chrome Extension &bull; AI-powered</span>
          <h1 className="lp-hero-title">
            Ace every quiz<br />with AI
          </h1>
          <p className="lp-hero-sub">
            QuizMind reads the question, finds the answer, and explains
            it &mdash; right inside your browser. Built for students,
            professionals, and lifelong learners.
          </p>
          <div className="lp-hero-actions">
            <a
              href="https://chrome.google.com/webstore"
              className="btn-primary btn-lg"
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to Chrome &mdash; it&apos;s free
            </a>
            <Link href="/app" className="btn-ghost btn-lg">
              Open dashboard &rarr;
            </Link>
          </div>
          <div className="lp-hero-trust">
            <span className="lp-trust-item">&#x2713; No credit card required</span>
            <span className="lp-trust-sep" aria-hidden="true">&middot;</span>
            <span className="lp-trust-item">&#x2713; Works on 500+ quiz platforms</span>
            <span className="lp-trust-sep" aria-hidden="true">&middot;</span>
            <span className="lp-trust-item">&#x2713; Private by default</span>
          </div>
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
                  <strong>Mitochondria</strong> &mdash; the organelle responsible
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
          <p className="lp-section-sub">
            From instant answers to team policy controls &mdash; QuizMind is built for
            serious learners and organisations at every scale.
          </p>
          <div className="lp-features-grid">
            {FEATURES.map((f) => (
              <article className="lp-feature-card" key={f.title}>
                <div className="lp-feature-icon-wrap" aria-hidden="true">
                  <span className="lp-feature-icon">{f.icon}</span>
                </div>
                <div className="lp-feature-body">
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
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

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-cta-card">
          <div className="lp-section-inner lp-cta-inner">
            <span className="lp-section-label">Get started today</span>
            <h2>Ready to learn smarter?</h2>
            <p>
              Join thousands of students and professionals using QuizMind every day.
              Install the extension and get your first answer in under 30 seconds.
            </p>
            <div className="lp-cta-actions">
              <a
                href="https://chrome.google.com/webstore"
                className="btn-primary btn-lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                Add to Chrome &mdash; it&apos;s free
              </a>
              <Link href="/features" className="btn-ghost btn-lg">
                See all features
              </Link>
            </div>
            <p className="lp-cta-note">No account required to install. Sign up in-app when ready.</p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span className="lp-brand">QuizMind</span>
          <div className="lp-footer-links">
            <Link href="/features">Features</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/roadmap">Roadmap</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/auth/login">Sign in</Link>
            <Link href="/app">Dashboard</Link>
          </div>
          <span className="lp-footer-copy">&copy; 2025 QuizMind</span>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: '\u26A1',
    title: 'Instant answers',
    desc: 'Get an answer in under a second, right where you need it \u2014 no tab switching.',
  },
  {
    icon: '\uD83D\uDCF8',
    title: 'Screenshot mode',
    desc: 'Capture any visual question \u2014 diagrams, charts, equations, images.',
  },
  {
    icon: '\uD83D\uDCDA',
    title: 'Deep explanations',
    desc: 'Not just the answer \u2014 understand the why behind every result.',
  },
  {
    icon: '\uD83D\uDD04',
    title: 'History & sync',
    desc: 'Your questions and answers sync across all your devices automatically.',
  },
  {
    icon: '\uD83D\uDD12',
    title: 'Private by default',
    desc: 'Your questions never leave without your explicit permission.',
  },
  {
    icon: '\u2699\uFE0F',
    title: 'Team config',
    desc: 'Workspace admins can push settings and model policies to the whole team.',
  },
];

const STEPS = [
  {
    title: 'Encounter a question',
    desc: 'Highlight text on any quiz, form, or exercise \u2014 or take a screenshot of a visual question.',
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
