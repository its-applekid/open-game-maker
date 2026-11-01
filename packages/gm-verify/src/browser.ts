import type { Tier, ViewId } from '@ogm/contracts';
import { chromium, type Browser, type BrowserContextOptions, type Page } from 'playwright';

import { ConsoleCollector } from './console.js';
import { HookDriver } from './hooks.js';
import { SOFTWARE_RENDERER, type ViewportName } from './report.js';

export const GPU_ARGS = ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'];
export const SOFTWARE_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
export const READY_TIMEOUT_MS = 180_000;

export const VIEWPORTS: Record<ViewportName, BrowserContextOptions> = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

export function isSoftware(renderer: string): boolean {
  return SOFTWARE_RENDERER.test(renderer);
}

export function launch(software: boolean): Promise<Browser> {
  return chromium.launch({ headless: true, args: software ? SOFTWARE_ARGS : GPU_ARGS });
}

/** The WebGL `UNMASKED_RENDERER_WEBGL` string of this page's GPU process. */
export async function rendererString(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = (document.createElement('canvas').getContext('webgl2') ??
      document.createElement('canvas').getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'no WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
}

/** `?build=test&capture=1&tier=` on top of the caller's query. */
export function gameUrl(url: string, tier: Tier): string {
  const target = new URL(url);
  target.searchParams.set('build', 'test');
  target.searchParams.set('capture', '1');
  target.searchParams.set('tier', tier);
  return target.href;
}

export type OpenGameOptions = {
  viewport: ViewportName;
  tier: Tier;
  rig?: ViewId;
  /** Shared across viewports so one report counts each message once per occurrence. */
  console?: ConsoleCollector;
  readyTimeoutMs?: number;
  contextOptions?: BrowserContextOptions;
};

export type OpenedGame = {
  page: Page;
  hooks: HookDriver;
  renderer: string;
  software: boolean;
  console: ConsoleCollector;
  close(): Promise<void>;
};

/**
 * Opens the game at `url` in a fresh context and waits for `window.__gm.ready` (or the `__ready` alias). A page error
 * before ready rejects at once with its text instead of waiting out the timeout (the capture.mjs rule).
 */
export async function openGame(browser: Browser, url: string, options: OpenGameOptions): Promise<OpenedGame> {
  const context = await browser.newContext({ ...VIEWPORTS[options.viewport], ...options.contextOptions });
  const page = await context.newPage();
  const collector = options.console ?? new ConsoleCollector();
  let failEarly: (error: Error) => void = () => {};
  const early = new Promise<never>((_, reject) => {
    failEarly = reject;
  });
  early.catch(() => {});
  let ready = false;
  page.on('pageerror', (error) => {
    collector.add('error', error.message);
    if (!ready) failEarly(new Error(`page failed before ready: ${error.message}`));
  });
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error') collector.add('error', message.text());
    else if (type === 'warning') collector.add('warning', message.text());
  });
  try {
    await Promise.race([
      page.goto(gameUrl(url, options.tier), {
        waitUntil: 'commit',
        timeout: options.readyTimeoutMs ?? READY_TIMEOUT_MS,
      }),
      early,
    ]);
    await Promise.race([
      page.waitForFunction(
        () => {
          const w = window as unknown as { __gm?: { ready?: boolean }; __ready?: boolean };
          return w.__gm?.ready === true || w.__ready === true;
        },
        null,
        { timeout: options.readyTimeoutMs ?? READY_TIMEOUT_MS, polling: 100 },
      ),
      early,
    ]);
    ready = true;
    const renderer = await rendererString(page);
    const hooks = await HookDriver.attach(page, options.rig);
    return {
      page,
      hooks,
      renderer,
      software: isSoftware(renderer) || renderer === 'no WebGL',
      console: collector,
      close: () => context.close(),
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}
