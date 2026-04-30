import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const usageTsx = readFileSync(join(process.cwd(), 'src/app/app/usage/usage-page-client.tsx'), 'utf8');
const historyModalTsx = readFileSync(join(process.cwd(), 'src/app/app/history/ai-request-detail-modal.tsx'), 'utf8');

describe('dark theme style coverage', () => {
  it('defines dark mode and semantic tokens', () => {
    expect(css).toContain('[data-theme="dark"]');
    for (const token of ['--surface', '--surface-strong', '--input-bg', '--modal-bg', '--code-bg', '--table-head-bg']) {
      expect(css).toContain(token);
    }
  });

  it('tokenizes required shared selectors', () => {
    for (const selector of [
      '.auth-page__backdrop',
      '.auth-panel',
      '.auth-field input',
      '.filter-panel',
      '.filter-field input',
      '.event-row',
      '.history-price-pill',
      '.installation-row',
      '.settings-profile-field input',
    ]) {
      expect(css).toContain(selector);
    }
    expect(css).toContain('[data-theme="dark"] .auth-page__backdrop');
    expect(css).toContain('background: var(--input-bg)');
    expect(css).toContain('border: 1px solid var(--line)');
  });

  it('keeps usage/history modal inline styles theme-aware', () => {
    expect(usageTsx).not.toContain('var(--surface, #fff)');
    expect(usageTsx).toContain('var(--table-head-bg)');
    expect(usageTsx).not.toContain('#f8fafc');
    expect(historyModalTsx).toContain('var(--modal-bg)');
    expect(historyModalTsx).toContain('var(--overlay-bg)');
    expect(historyModalTsx).toContain('var(--code-bg)');
    expect(historyModalTsx).toContain('var(--code-ink)');
    expect(historyModalTsx).not.toContain('#f4f4f5');
  });
});
