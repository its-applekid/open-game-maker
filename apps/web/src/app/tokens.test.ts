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
    expect(css).toContain('--gruvbox-green-neutral: #98971a');
    expect(css).toContain('--gruvbox-green: #b8bb26');
    expect(css).toContain('--gruvbox-yellow: #fabd2f');
    expect(css).toContain('--gruvbox-blue: #83a598');
    expect(css).toContain('--gruvbox-purple: #d3869b');
    expect(css).toContain('--gruvbox-aqua: #8ec07c');
    expect(css).toContain('--gruvbox-orange: #fe8019');
    expect(css).toContain('--action-primary: var(--gruvbox-green-neutral)');
    expect(css).toContain('--action-primary-text: var(--gruvbox-bg0-h)');
    expect(css).toContain('--action-secondary: var(--gruvbox-bg1)');
    expect(css).toContain('--action-secondary-text: var(--gruvbox-fg)');
    expect(css).toContain('--focus-ring: var(--gruvbox-aqua)');
    expect(css).toContain('--text-muted: color-mix(in srgb, var(--gruvbox-fg4) 50%, var(--gruvbox-fg))');
    expect(css).toContain('--text-danger: color-mix(in srgb, var(--gruvbox-red) 60%, var(--gruvbox-fg))');
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
    const gameResponsiveCss = readFileSync(resolve(sourceRoot, 'routes/games/games-responsive.css'), 'utf8');
    expect(gameResponsiveCss).toMatch(/\.game-tile:focus-visible\s*{[^}]*var\(--focus-ring\)/);
    expect(gameResponsiveCss).not.toMatch(/\.game-tile:hover\s*{[^}]*var\(--yellow-b\)/);
    expect(readFileSync(resolve(sourceRoot, 'routes/game/releases/releases.css'), 'utf8')).toMatch(
      /\.release-public-note\s*{[^}]*color: var\(--text-muted\)/,
    );
    expect(readFileSync(resolve(sourceRoot, 'routes/game/versions/versioning.css'), 'utf8')).toMatch(
      /\.versioning-dialog-error\s*{[^}]*color: var\(--text-danger\)/,
    );
    expect(readFileSync(resolve(sourceRoot, 'routes/title/title.css'), 'utf8')).toMatch(
      /\.title-start\s*{[^}]*border: 0;[^}]*background: var\(--action-primary\);/,
    );
    expect(readFileSync(resolve(process.cwd(), 'title-town/index.html'), 'utf8')).toContain('background:#1d2021');
    expect(JSON.parse(readFileSync(resolve(process.cwd(), 'public/site.webmanifest'), 'utf8'))).toMatchObject({
      background_color: '#282828',
      theme_color: '#282828',
    });
    const source = 'const image = "//cdn.example/image.png"; const style = { color: "#fff" }; // #000';

    expect(stripTypeScriptComments('fixture.tsx', source)).toContain('#fff');
    expect(stripTypeScriptComments('fixture.tsx', source)).not.toContain('#000');
  });

  it('meets WCAG AA for the shared text and primary-action pairs', () => {
    const tokens = parseColors(readFileSync(tokenPath, 'utf8'));

    expect(tokens.get('--action-primary')).toBe('#98971a');
    expectContrast(tokens, '--text', '--surface-page');
    expectContrast(tokens, '--text', '--surface-card');
    expectContrast(tokens, '--text-muted', '--surface-page');
    expectContrast(tokens, '--text-muted', '--surface-card');
    expectContrast(tokens, '--text-muted', '--surface-raised');
    expectContrast(tokens, '--text-danger', '--surface-card');
    expectContrast(tokens, '--action-primary-text', '--action-primary');
    expectContrast(tokens, '--action-danger-text', '--action-danger');
  });
});

function parseColors(css: string): Map<string, string> {
  const declarations = new Map(
    [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]),
  );
  const resolved = new Map<string, string>();

  const resolveColor = (name: string): string => {
    const cached = resolved.get(name);
    if (cached) return cached;
    const value = declarations.get(name);
    if (!value) throw new Error(`missing colour token ${name}`);
    const alias = value.match(/^var\((--[\w-]+)\)$/);
    const mix = value.match(
      /^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+([\d.]+)%,\s*var\((--[\w-]+)\)\)$/,
    );
    const color = alias
      ? resolveColor(alias[1]!)
      : mix
        ? mixHex(resolveColor(mix[1]!), resolveColor(mix[3]!), Number(mix[2]) / 100)
        : value;
    if (!/^#[\da-f]{6}$/i.test(color)) throw new Error(`unsupported colour token ${name}: ${value}`);
    resolved.set(name, color);
    return color;
  };

  for (const name of declarations.keys()) {
    try {
      resolveColor(name);
    } catch {
      // Non-colour layout tokens are outside this helper's contract.
    }
  }
  return resolved;
}

function mixHex(first: string, second: string, firstWeight: number): string {
  const channels = (hex: string) => hex.slice(1).match(/.{2}/g)!.map((value) => Number.parseInt(value, 16));
  const secondChannels = channels(second);
  return `#${channels(first)
    .map((value, index) => Math.round(value * firstWeight + secondChannels[index]! * (1 - firstWeight)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

function expectContrast(tokens: Map<string, string>, foreground: string, background: string): void {
  expect(contrast(tokens.get(foreground)!, tokens.get(background)!)).toBeGreaterThanOrEqual(4.5);
}

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
