import { describe, expect, it } from 'vitest';

import { c08Published } from '../../src/checks/c08-published.js';
import { fakeContext } from '../fake-session.js';

describe('C8 published-no-debug', () => {
  it('passes a clean bundle with no globals, mounted as published with no capabilities', async () => {
    const ctx = fakeContext();
    expect((await c08Published.run(ctx)).status).toBe('pass');
    expect(ctx.sessions[0]!.options).toMatchObject({ build: 'published', capabilities: [] });
  });

  it('fails when a debug global is present on the published window', async () => {
    const result = await c08Published.run(fakeContext({ publishedGlobals: ['__gm'] }));
    expect(result).toMatchObject({ status: 'fail', detail: 'published window exposes __gm' });
  });

  it('fails when the bundle carries the adapter', async () => {
    const ctx = fakeContext({}, { publishedBundle: [{ path: 'assets/a.js', text: 'w.render_game_to_text=1' }] });
    expect((await c08Published.run(ctx)).status).toBe('fail');
  });
});
