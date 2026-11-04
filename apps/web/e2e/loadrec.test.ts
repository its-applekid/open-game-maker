import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createTownReadyGate, formatHttpError, loadWindowMilliseconds, recordLoad } from '../tools/loadrec.mjs';

describe('deploy load recorder', () => {
  it('accepts a positive readiness window in seconds', () => {
    expect(loadWindowMilliseconds('60')).toBe(60_000);
    expect(() => loadWindowMilliseconds('0')).toThrow(/positive number/);
    expect(() => loadWindowMilliseconds('later')).toThrow(/positive number/);
  });

  it('stops waiting as soon as town-ready arrives', async () => {
    const gate = createTownReadyGate();
    const deadline = vi.fn(() => new Promise<void>(() => undefined));
    const waiting = gate.wait(60_000, deadline);

    gate.mark('msg unrelated');
    expect(deadline).toHaveBeenCalledOnce();
    gate.mark('msg town-ready');

    await expect(waiting).resolves.toBeUndefined();
  });

  it('stops waiting when the readiness window ends', async () => {
    const gate = createTownReadyGate();
    const deadline = vi.fn(async () => undefined);

    await expect(gate.wait(60_000, deadline)).resolves.toBeUndefined();
    expect(deadline).toHaveBeenCalledOnce();
  });

  it('prints the status and URL for failed HTTP responses only', () => {
    expect(formatHttpError({ status: () => 500, url: () => 'https://app.example/api/me' })).toBe(
      'http 500 https://app.example/api/me',
    );
    expect(formatHttpError({ status: () => 302, url: () => 'https://app.example/redirect' })).toBeUndefined();
    expect(formatHttpError({ status: () => 200, url: () => 'https://app.example/' })).toBeUndefined();
  });

  it('wires response errors and town readiness into the recording flow', async () => {
    const output = await mkdtemp(join(tmpdir(), 'ogm-loadrec-'));
    const handlers = new Map<string, (value: unknown) => unknown>();
    let mark: (_source: unknown, value: unknown) => void = () => undefined;
    const cdp = { send: vi.fn(async () => undefined) };
    const page = {
      on: vi.fn((event: string, handler: (value: unknown) => unknown) => handlers.set(event, handler)),
      exposeBinding: vi.fn(async (_name: string, handler: typeof mark) => {
        mark = handler;
      }),
      addInitScript: vi.fn(async () => undefined),
      goto: vi.fn(async () => {
        handlers.get('response')?.({ status: () => 500, url: () => 'http://127.0.0.1:43171/api/me' });
        mark(undefined, 'msg town-ready');
      }),
    };
    const context = {
      newPage: vi.fn(async () => page),
      newCDPSession: vi.fn(async () => cdp),
      close: vi.fn(async () => undefined),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => undefined),
    };
    const browserType = { launch: vi.fn(async () => browser) };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await recordLoad([output, 'http://127.0.0.1:43171/', '60'], browserType);

      expect(log).toHaveBeenCalledWith(expect.stringContaining('http 500 http://127.0.0.1:43171/api/me'));
      expect(log).toHaveBeenCalledWith(expect.stringContaining('msg town-ready'));
      expect(context.close).toHaveBeenCalledOnce();
      expect(browser.close).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
      await rm(output, { recursive: true, force: true });
    }
  });
});
