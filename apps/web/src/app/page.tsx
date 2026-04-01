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
