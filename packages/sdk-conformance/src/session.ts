import type { Patch } from '@ogm/contracts/bridge';
import type { GameManifest, SaveData } from '@ogm/contracts/game';
import type { Browser, BrowserContext, Frame, Page } from 'playwright';

import type { GameText, OpenOptions, Session, TargetHit } from './types.js';

export const READY_TIMEOUT_MS = 60_000;
const GLOBAL_NAMES = ['__gm', 'render_game_to_text', 'advanceTime', '__frame', '__ready', '__marks'];

/** The game never reached `ready`; `detail` carries the reason and the console tail. */
export class BootError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'BootError';
  }
}

export type Origins = { host: string; games: Record<OpenOptions['build'], string> };

let rev = 0;

export class BrowserSession implements Session {
  private constructor(
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly game: Frame,
    readonly manifest: GameManifest,
  ) {}

  static async open(browser: Browser, origins: Origins, options: OpenOptions): Promise<BrowserSession> {
    const context = await browser.newContext({ viewport: options.viewport });
    const consoleTail: string[] = [];
    try {
      const page = await context.newPage();
      page.on('console', (entry) => {
        if (entry.type() === 'error') consoleTail.push(entry.text());
      });
      page.on('pageerror', (error) => consoleTail.push(String(error)));
      const url = new URL(origins.host);
      url.searchParams.set('game', origins.games[options.build]);
      url.searchParams.set('build', options.build);
      url.searchParams.set('caps', options.capabilities.join(','));
      await page.goto(url.href);
      await page.waitForFunction(() => window.__conf?.manifest !== null || window.__conf?.failure !== null, null, {
        timeout: READY_TIMEOUT_MS,
      });
      const failure = await page.evaluate(() => window.__conf.failure);
      if (failure) throw new Error(failure);
      const manifest = (await page.evaluate(() => window.__conf.manifest))!;
      const game = page.frames().find((frame) => frame.url().includes('/g/conf/'));
      if (!game) throw new Error('game frame is missing');
      /* Templates send `ready` at boot, then hold `__ready` false until their renderer compiles. */
      if (options.build === 'test') {
        await game.waitForFunction(() => (window as { __ready?: boolean }).__ready === true, null, { timeout: READY_TIMEOUT_MS });
      }
      await page.evaluate(
        ({ width, height, safe }) => window.__conf.setViewport(width, height, safe),
        { ...options.viewport, safe: options.safe },
      );
      return new BrowserSession(context, page, game, manifest);
    } catch (error) {
      await context.close();
      const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
      throw new BootError([reason, ...consoleTail.slice(-5)].join(' | '));
    }
  }

  async advanceTime(ms: number): Promise<void> {
    await this.request('test.advanceTime', { ms });
  }

  async setSeed(seed: number): Promise<void> {
    await this.request('test.setSeed', { seed });
  }

  async text(): Promise<GameText> {
    return (await this.request('test.renderGameToText', {})) as GameText;
  }

  async applyDesign(doc: unknown, patches: Patch[]): Promise<'live' | 'restart-scene'> {
    rev += 1;
    const outcome = await this.page.evaluate(
      async ({ doc, patches, rev }) => {
        const conf = window.__conf;
        const before = conf.errors.length;
        conf.send('design.apply', { rev, doc, patches });
        await conf.barrier();
        const applied = conf.applied.find((entry) => entry.rev === rev);
        return applied ? { result: applied.result } : { error: conf.errors.slice(before).join('; ') || 'no reply' };
      },
      { doc, patches, rev },
    );
    if ('error' in outcome) throw new Error(outcome.error);
    return outcome.result as 'live' | 'restart-scene';
  }

  async restore(save: SaveData<unknown>): Promise<void> {
    const errors = await this.sendAndSettle('save.restore', save);
    if (errors.length > 0) throw new Error(errors.join('; '));
  }

  async pause(): Promise<void> {
    await this.sendAndSettle('lifecycle.pause', {});
  }

  async resume(): Promise<void> {
    await this.sendAndSettle('lifecycle.resume', {});
  }

  async saves(): Promise<SaveData<unknown>[]> {
    return this.page.evaluate(() => structuredClone(window.__conf.saves));
  }

  async idle(ms: number): Promise<void> {
    await this.game.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    await this.page.waitForTimeout(ms);
  }

  async validatePlacement(prefab: string, position: [number, number, number]) {
    return this.page.evaluate(
      async ({ prefab, position }) => {
        const conf = window.__conf;
        const before = conf.placements.length;
        conf.send('editor.validatePlacement', { prefab, pose: { position } });
        await conf.barrier();
        return conf.placements[before] ?? null;
      },
      { prefab, position },
    );
  }

  async scan(n: number): Promise<TargetHit[]> {
    return this.page.evaluate((n) => window.__conf.scan(n), n);
  }

  async still(path: string): Promise<{ colours: number }> {
    const png = await this.page.screenshot({ path });
    return { colours: await this.page.evaluate((png) => window.__conf.colours(png), png.toString('base64')) };
  }

  async globals(): Promise<string[]> {
    return this.game.evaluate((names) => names.filter((name) => name in window), GLOBAL_NAMES);
  }

  async close(): Promise<void> {
    await this.context.close();
  }

  private request(type: string, payload: unknown): Promise<unknown> {
    return this.page.evaluate(({ type, payload }) => window.__conf.request(type, payload), { type, payload });
  }

  private sendAndSettle(type: string, payload: unknown): Promise<string[]> {
    return this.page.evaluate(
      async ({ type, payload }) => {
        const conf = window.__conf;
        const before = conf.errors.length;
        conf.send(type, payload);
        await conf.barrier();
        return conf.errors.slice(before);
      },
      { type, payload },
    );
  }
}
