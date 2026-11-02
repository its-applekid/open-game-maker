import type { Browser, Page } from 'playwright';
import { describe, expect, it } from 'vitest';

import { BrowserSession, type Origins } from '../src/session.js';

describe('BrowserSession', () => {
  it('reports a page error that fires after the game is ready', async () => {
    const listeners: Record<string, (value: unknown) => void> = {};
    let evaluateCall = 0;
    const frame = {
      url: () => 'http://127.0.0.1/g/conf/',
      waitForFunction: async () => undefined,
    };
    const page = {
      on: (event: string, listener: (value: unknown) => void) => {
        listeners[event] = listener;
      },
      goto: async () => undefined,
      waitForFunction: async () => undefined,
      evaluate: async () => {
        evaluateCall += 1;
        if (evaluateCall === 1) return null;
        if (evaluateCall === 2) return { id: 'fixture' };
        return undefined;
      },
      frames: () => [frame],
    } as unknown as Page;
    const context = {
      newPage: async () => page,
      close: async () => undefined,
    };
    const browser = {
      newContext: async () => context,
    } as unknown as Browser;
    const origins: Origins = {
      host: 'http://127.0.0.1:43170',
      games: { test: 'http://127.0.0.1:43171', published: 'http://127.0.0.1:43172' },
    };

    const session = await BrowserSession.open(browser, origins, {
      build: 'test',
      capabilities: [],
      viewport: { width: 1280, height: 720 },
      safe: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    listeners.pageerror!(new Error('boom'));

    await expect(session.close()).rejects.toThrow('page error during run: Error: boom');
  });
});
