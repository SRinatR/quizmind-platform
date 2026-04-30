import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const usageTsx = readFileSync(join(process.cwd(), 'src/app/app/usage/usage-page-client.tsx'), 'utf8');
const historyModalTsx = readFileSync(join(process.cwd(), 'src/app/app/history/ai-request-detail-modal.tsx'), 'utf8');
const historyPageTsx = readFileSync(join(process.cwd(), 'src/app/app/history/history-page-client.tsx'), 'utf8');

function darkBlockFor(selector: string): string {
  const token = `[data-theme="dark"] ${selector}`;
  const i = css.indexOf(token);
  if (i === -1) return '';
  return css.slice(i, i + 420);
}

describe('dark theme style coverage', () => {
  it('defines dark mode and semantic tokens', () => {
    expect(css).toContain('[data-theme="dark"]');
    for (const token of [
      '--surface-filter', '--surface-card', '--surface-row', '--surface-row-hover',
      '--button-outline-bg', '--button-outline-border', '--button-outline-ink',
      '--danger-outline-bg', '--danger-outline-border', '--danger-outline-ink', '--danger-outline-hover-bg', '--danger-outline-hover-ink',
      '--pill-bg', '--pill-ink', '--pill-success-bg', '--pill-success-ink', '--pill-muted-bg', '--pill-muted-ink',
      '--auth-panel-bg', '--auth-panel-ink', '--auth-panel-muted',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('tokenizes required shared selectors', () => {
    for (const selector of [
      '.auth-panel', '.auth-field input', '.auth-links',
      '.filter-panel', '.event-row', '.history-price-pill',
      '.tag-soft', '.installation-row', '.btn-outline', '.btn-danger-outline',
    ]) {
      expect(css).toContain(selector);
    }
  });

  it('dark theme avoids obvious light backgrounds on key surfaces', () => {
    const forbidden = [
      'background: #fff', 'background: #fffaf1', 'background: #fbf7f1', 'background: #f8f4ee', 'background: #f4f4f5', 'background: rgba(255, 255, 255',
    ];
    for (const selector of ['.filter-panel', '.event-row', '.history-price-pill', '.tag-soft', '.installation-row', '.auth-panel']) {
      const block = darkBlockFor(selector);
      expect(block.length).toBeGreaterThan(0);
      for (const bad of forbidden) expect(block).not.toContain(bad);
    }
  });

  it('adds explicit dark-mode readability overrides', () => {
    expect(css).toContain('[data-theme="dark"] .filter-panel');
    expect(css).toContain('[data-theme="dark"] .history-price-pill--charged');
    expect(css).toContain('[data-theme="dark"] .history-price-pill--estimated');
    expect(css).toContain('[data-theme="dark"] .btn-danger-outline');
    expect(css).toContain('[data-theme="dark"] .auth-panel');
  });

  it('keeps usage/history modal inline styles theme-aware', () => {
    expect(usageTsx).not.toContain('var(--surface, #fff)');
    expect(usageTsx).toContain('var(--table-head-bg)');
    expect(historyModalTsx).toContain('var(--modal-bg)');
    expect(historyModalTsx).toContain('var(--overlay-bg)');
    expect(historyModalTsx).toContain('var(--code-bg)');
    expect(historyModalTsx).toContain('var(--code-ink)');
    expect(historyPageTsx).not.toContain('#ddd');
  });
});
