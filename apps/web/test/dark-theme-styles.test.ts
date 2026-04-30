import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

describe('dark theme token coverage', () => {
  it('defines dark theme and semantic tokens', () => {
    expect(css).toContain('[data-theme="dark"]');
    for (const token of ['--surface', '--surface-strong', '--input-bg', '--modal-bg', '--code-bg', '--table-head-bg']) {
      expect(css).toContain(token);
    }
  });

  it('uses theme variables on key shared classes', () => {
    const expected = [
      '.auth-panel',
      '.history-filter-field input',
      '.settings-profile-field input',
      '.wallet-modal',
      '.admin-support-preset-card',
      '.list-item',
    ];
    for (const selector of expected) {
      expect(css).toContain(selector);
    }
    expect(css).toContain('background: var(--surface');
    expect(css).toContain('border: 1px solid var(--line)');
    expect(css).toContain('background: var(--input-bg)');
  });

  it('removes obvious light-only hardcoded app backgrounds', () => {
    expect(css).not.toContain('background: #fff;');
    expect(css).not.toContain('background: #fffaf1;');
    expect(css).not.toContain('background: #fbf7f1;');
  });
});
