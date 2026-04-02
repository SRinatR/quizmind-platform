'use client';

import Link from 'next/link';

import { usePreferences } from '../lib/preferences';

export default function HomePage() {
  const { t } = usePreferences();
  const th = t.publicPages.home;

  return (
    <div className="lp-root">
      {/* ── Navigation ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <span className="lp-brand">QuizMind</span>
          <div className="lp-nav-links">
            <Link href="/features">{th.navFeatures}</Link>
            <Link href="/docs">{th.navDocs}</Link>
            <Link href="/blog">{th.navBlog}</Link>
            <Link href="/faq">{th.navFaq}</Link>
          </div>
          <div className="lp-nav-actions">
            <Link href="/auth/login" className="btn-ghost">{th.signIn}</Link>
            <Link href="/auth/login" className="btn-primary">{th.getStarted}</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <span className="lp-badge">{th.badge}</span>
          <h1 className="lp-hero-title">
            Ace every quiz<br />with AI
          </h1>
          <p className="lp-hero-sub">{th.heroSub}</p>
          <div className="lp-hero-actions">
            <a
              href="https://chrome.google.com/webstore"
              className="btn-primary btn-lg"
              target="_blank"
              rel="noopener noreferrer"
            >
              {th.addToChrome}
            </a>
            <Link href="/app" className="btn-ghost btn-lg">
              {th.openDashboard} &rarr;
            </Link>
          </div>
          <div className="lp-hero-trust">
            <span className="lp-trust-item">&#x2713; {th.noCreditCard}</span>
            <span className="lp-trust-sep" aria-hidden="true">&middot;</span>
            <span className="lp-trust-item">&#x2713; {th.worksOn}</span>
            <span className="lp-trust-sep" aria-hidden="true">&middot;</span>
            <span className="lp-trust-item">&#x2713; {th.privateByDefault}</span>
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

      {/* ── Platform compatibility strip ── */}
      <div className="lp-compat-strip">
        <div className="lp-compat-strip-inner">
          <span className="lp-compat-label">Works on any quiz, form, or learning platform</span>
          <div className="lp-compat-chips">
            <span className="lp-compat-chip">Any webpage</span>
            <span className="lp-compat-chip">Online quizzes</span>
            <span className="lp-compat-chip">LMS platforms</span>
            <span className="lp-compat-chip">Google Forms</span>
            <span className="lp-compat-chip">Screenshot mode</span>
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <section className="lp-section lp-features">
        <div className="lp-section-inner">
          <span className="lp-section-label">{th.featuresSection}</span>
          <h2 className="lp-section-title">{th.featuresTitle}</h2>
          <p className="lp-section-sub">{th.featuresSub}</p>
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

      {/* ── Use cases / Who it's for ── */}
      <section className="lp-section lp-usecases">
        <div className="lp-section-inner">
          <span className="lp-section-label">Who it&rsquo;s for</span>
          <h2 className="lp-section-title">Built for how you learn</h2>
          <p className="lp-section-sub">
            Whether you&rsquo;re a student, a fast reviewer, or a team managing AI access &mdash; QuizMind fits your workflow.
          </p>
          <div className="lp-usecases-grid">
            {USE_CASES.map((uc) => (
              <article className="lp-usecase-card" key={uc.title}>
                <div className="lp-usecase-icon" aria-hidden="true">{uc.icon}</div>
                <div className="lp-usecase-body">
                  <h3>{uc.title}</h3>
                  <p>{uc.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lp-section lp-how">
        <div className="lp-section-inner">
          <span className="lp-section-label">{th.howItWorks}</span>
          <h2 className="lp-section-title">{th.threeSteps}</h2>
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

      {/* ── Product showcase / Control center ── */}
      <section className="lp-section lp-showcase">
        <div className="lp-section-inner lp-showcase-inner">
          <div className="lp-showcase-copy">
            <span className="lp-section-label">Dashboard</span>
            <h2 className="lp-section-title lp-showcase-title">
              More than just an extension
            </h2>
            <p className="lp-showcase-sub">
              A full control center behind every answer. Manage workspace AI policies,
              provider keys, usage analytics, and billing &mdash; all in one place.
            </p>
            <ul className="lp-showcase-list">
              <li>Workspace-level AI model policies</li>
              <li>Bring-your-own-key for any provider</li>
              <li>Usage analytics and question history</li>
              <li>Flexible wallet and top-up billing</li>
              <li>Team extension installation management</li>
            </ul>
            <div className="lp-hero-actions">
              <Link href="/auth/login" className="btn-primary btn-lg">Open dashboard</Link>
              <Link href="/features" className="btn-ghost btn-lg">{th.seeAllFeatures}</Link>
            </div>
          </div>

          <div className="lp-showcase-visual">
            <div className="lp-dash-mockup">
              <div className="lp-dash-topbar">
                <span className="lp-dash-brand">QuizMind</span>
                <span className="lp-dash-ws-chip">My Workspace</span>
              </div>
              <div className="lp-dash-layout">
                <nav className="lp-dash-sidebar">
                  {[
                    { label: 'Overview', active: true },
                    { label: 'Billing', active: false },
                    { label: 'Usage', active: false },
                    { label: 'History', active: false },
                    { label: 'Settings', active: false },
                  ].map((item) => (
                    <span
                      key={item.label}
                      className={`lp-dash-nav${item.active ? ' lp-dash-nav--active' : ''}`}
                    >
                      {item.label}
                    </span>
                  ))}
                </nav>
                <div className="lp-dash-content">
                  <div className="lp-dash-stats">
                    {([
                      { val: 'Active', lbl: 'Session' },
                      { val: '6', lbl: 'Sections' },
                      { val: '\u20BD500', lbl: 'Balance' },
                    ] as const).map(({ val, lbl }) => (
                      <div className="lp-dash-stat-card" key={lbl}>
                        <span className="lp-dash-stat-val">{val}</span>
                        <span className="lp-dash-stat-lbl">{lbl}</span>
                      </div>
                    ))}
                  </div>
                  <div className="lp-dash-bars">
                    <div className="lp-dash-bar-row">
                      <span className="lp-dash-bar-lbl">AI usage</span>
                      <div className="lp-dash-bar">
                        <div className="lp-dash-bar-fill" style={{ width: '42%' }} />
                      </div>
                    </div>
                    <div className="lp-dash-bar-row">
                      <span className="lp-dash-bar-lbl">Questions</span>
                      <div className="lp-dash-bar">
                        <div className="lp-dash-bar-fill lp-dash-bar-fill--ok" style={{ width: '18%' }} />
                      </div>
                    </div>
                    <div className="lp-dash-bar-row">
                      <span className="lp-dash-bar-lbl">History</span>
                      <div className="lp-dash-bar">
                        <div className="lp-dash-bar-fill" style={{ width: '71%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-cta-card">
          <div className="lp-section-inner lp-cta-inner">
            <span className="lp-section-label">{th.ctaSection}</span>
            <h2>{th.ctaTitle}</h2>
            <p>{th.ctaDesc}</p>
            <div className="lp-cta-actions">
              <a
                href="https://chrome.google.com/webstore"
                className="btn-primary btn-lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                {th.addToChrome}
              </a>
              <Link href="/features" className="btn-ghost btn-lg">
                {th.seeAllFeatures}
              </Link>
            </div>
            <p className="lp-cta-note">{th.ctaNote}</p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span className="lp-brand">QuizMind</span>
          <div className="lp-footer-links">
            <Link href="/features">{th.navFeatures}</Link>
            <Link href="/docs">{th.navDocs}</Link>
            <Link href="/blog">{th.navBlog}</Link>
            <Link href="/changelog">{th.changelog}</Link>
            <Link href="/roadmap">{th.roadmap}</Link>
            <Link href="/faq">{th.navFaq}</Link>
            <Link href="/auth/login">{th.signIn}</Link>
            <Link href="/app">{th.dashboard}</Link>
          </div>
          <span className="lp-footer-copy">{th.footerCopy}</span>
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

const USE_CASES = [
  {
    icon: '\uD83C\uDF93',
    title: 'Students & learners',
    desc: 'Get instant answers with full explanations on any quiz, homework, or LMS platform.',
  },
  {
    icon: '\uD83D\uDCF8',
    title: 'Visual questions',
    desc: 'Screenshot diagrams, charts, and equations \u2014 QuizMind handles visual content natively.',
  },
  {
    icon: '\u26A1',
    title: 'Fast review',
    desc: 'Power through practice tests and study sessions with AI-assisted recall and context.',
  },
  {
    icon: '\uD83C\uDFE2',
    title: 'Teams & workspaces',
    desc: 'Admins control AI policies, manage provider keys, and track usage across the whole workspace.',
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
