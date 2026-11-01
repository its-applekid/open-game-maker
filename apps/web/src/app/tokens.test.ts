import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('shared design tokens', () => {
  it('keeps the phone, motion, and safe-area rules', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/tokens.css'), 'utf8');

    expect(css).toContain('--tap-primary: 64px');
    expect(css).toContain('--tap-secondary: 44px');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('env(safe-area-inset-left');
    expect(css).toContain('100svh');
    expect(css).toContain('max-height: 540px');
  });
});
