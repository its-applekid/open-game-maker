import { describe, expect, it } from 'vitest';

import playwrightConfig from '../playwright.config.js';
import viteConfig from '../vite.config.js';

/*
 * The build kind is compiled into the bundle (`__GM_BUILD__`), so no unit test can read it back
 * from a build's output. Pin the places that decide it instead: the vite config's define and the
 * Playwright webServer that must request a test build. A default `vite build` is never a test build.
 */

type ConfigEnv = { command: 'build' | 'serve'; mode: string };
type ResolvedConfig = { define?: Record<string, string> };
const resolveConfig = viteConfig as unknown as (env: ConfigEnv) => ResolvedConfig;

const buildKind = (mode: string): string => {
  const define = resolveConfig({ command: 'build', mode }).define;
  return JSON.parse(define?.__GM_BUILD__ ?? '"draft"') as string;
};

const webServerCommands = (): string => {
  const servers = Array.isArray(playwrightConfig.webServer) ? playwrightConfig.webServer : [playwrightConfig.webServer];
  return servers.map((server) => server?.command ?? '').join(' && ');
};

describe('the template build kind follows the vite mode', () => {
  it('a published build is published', () => {
    expect(buildKind('published')).toBe('published');
  });

  it('an explicit test build is a test build', () => {
    expect(buildKind('test')).toBe('test');
  });

  it('a default `vite build` is a draft, never a test build', () => {
    expect(buildKind('production')).toBe('draft');
  });

  it('the dev server is a draft', () => {
    expect(buildKind('development')).toBe('draft');
  });
});

describe('the browser tests build the template as an explicit test build', () => {
  it('the Playwright webServer asks vite for the test mode', () => {
    expect(webServerCommands()).toContain('vite build --mode test');
  });
});
