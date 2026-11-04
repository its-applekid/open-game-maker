import { readdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import { createScanner, LanguageVariant, ScriptTarget, SyntaxKind } from 'typescript';
import { describe, expect, it } from 'vitest';

describe('shared design tokens', () => {
  const sourceRoot = resolve(process.cwd(), 'src');
  const tokenPath = resolve(sourceRoot, 'tokens.css');

  it('keeps the phone, motion, and safe-area rules', () => {
    const css = readFileSync(tokenPath, 'utf8');

    expect(css).toContain('--tap-primary: 64px');
    expect(css).toContain('--tap-secondary: 44px');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('env(safe-area-inset-left');
    expect(css).toContain('100svh');
    expect(css).toContain('max-height: 540px');
  });

  it('owns the canonical Gruvbox dark palette and semantic action roles', () => {
    const css = readFileSync(tokenPath, 'utf8');

    expect(css).toContain('--gruvbox-bg: #282828');
    expect(css).toContain('--gruvbox-bg0-h: #1d2021');
    expect(css).toContain('--gruvbox-bg1: #3c3836');
    expect(css).toContain('--gruvbox-bg2: #504945');
    expect(css).toContain('--gruvbox-fg: #ebdbb2');
    expect(css).toContain('--gruvbox-fg4: #a89984');
    expect(css).toContain('--gruvbox-red: #fb4934');
    expect(css).toContain('--gruvbox-green: #b8bb26');
    expect(css).toContain('--gruvbox-yellow: #fabd2f');
    expect(css).toContain('--gruvbox-blue: #83a598');
    expect(css).toContain('--gruvbox-purple: #d3869b');
    expect(css).toContain('--gruvbox-aqua: #8ec07c');
    expect(css).toContain('--gruvbox-orange: #fe8019');
    expect(css).toContain('--action-primary: var(--gruvbox-yellow)');
    expect(css).toContain('--action-primary-text: var(--gruvbox-bg0-h)');
    expect(css).toContain('--action-secondary: var(--gruvbox-bg1)');
    expect(css).toContain('--action-secondary-text: var(--gruvbox-fg)');
    expect(css).toContain('--focus-ring: var(--gruvbox-aqua)');
    expect(css).toContain('--text-muted: color-mix(in srgb, var(--gruvbox-fg4) 50%, var(--gruvbox-fg))');
  });

  it('keeps chrome colours in the token file and app surfaces flat', () => {
    const sourceFiles = filesBelow(sourceRoot).filter((file) => {
      return ['.css', '.ts', '.tsx'].includes(extname(file)) && !/\.(?:test|spec)\.[^.]+$/.test(file);
    });
    const sourceByFile = new Map(
      sourceFiles.map((file) => {
        const source = readFileSync(file, 'utf8');
        return [file, extname(file) === '.css' ? source : stripTypeScriptComments(file, source)] as const;
      }),
    );
    const chromeFiles = sourceFiles.filter((file) => file !== tokenPath);
    const offenders = chromeFiles.flatMap((file) => {
      const source = sourceByFile.get(file)!;
      const findings: string[] = [];
      if (/(?:repeating-)?(?:conic|linear|radial)-gradient\(|createRadialGradient/i.test(source)) {
        findings.push('gradient');
      }
      if (/(?:#[\da-f]{3,8}\b|(?:rgb|hsl)a?\()/i.test(source)) findings.push('colour literal');
      return findings.map((finding) => `${file.slice(sourceRoot.length + 1)}: ${finding}`);
    });

    expect(offenders).toEqual([]);
    expect(readFileSync(resolve(sourceRoot, 'routes/games/games-responsive.css'), 'utf8')).toMatch(
      /\.game-tile:focus-visible\s*{[^}]*var\(--focus-ring\)/,
    );
    expect(readFileSync(resolve(sourceRoot, 'routes/game/releases/releases.css'), 'utf8')).toContain(
      'color: var(--purple-b)',
    );
    expect(readFileSync(resolve(sourceRoot, 'routes/game/versions/versioning.css'), 'utf8')).toContain(
      'color: var(--purple-b)',
    );
  });

  it('distinguishes comment markers from quoted slashes', () => {
    const source = 'const image = "//cdn.example/image.png"; const style = { color: "#fff" }; // #000';

    expect(stripTypeScriptComments('fixture.tsx', source)).toContain('#fff');
    expect(stripTypeScriptComments('fixture.tsx', source)).not.toContain('#000');
  });

  it('meets WCAG AA for the shared text and primary-action pairs', () => {
    expect(contrast('#ebdbb2', '#282828')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ebdbb2', '#3c3836')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#a89984', '#282828')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#caba9b', '#504945')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#1d2021', '#fabd2f')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#1d2021', '#fb4934')).toBeGreaterThanOrEqual(4.5);
  });
});

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : path;
  });
}

function stripTypeScriptComments(file: string, source: string): string {
  const variant = file.endsWith('.tsx') ? LanguageVariant.JSX : LanguageVariant.Standard;
  const scanner = createScanner(ScriptTarget.Latest, false, variant, source);
  const tokens: string[] = [];
  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== SyntaxKind.SingleLineCommentTrivia && token !== SyntaxKind.MultiLineCommentTrivia) {
      tokens.push(scanner.getTokenText());
    }
  }
  return tokens.join('');
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
