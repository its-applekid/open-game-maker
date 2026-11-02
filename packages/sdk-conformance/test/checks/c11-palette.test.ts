import { describe, expect, it } from 'vitest';

import { c11Palette } from '../../src/checks/c11-palette.js';
import { fakeContext, MANIFEST } from '../fake-session.js';

describe('C11 palette-undo', () => {
  it('passes when every palette placement undoes byte-equal', async () => {
    expect((await c11Palette.run(fakeContext())).status).toBe('pass');
  });

  it('fails a palette item that does not revert', async () => {
    const result = await c11Palette.run(fakeContext({ placementSticks: true }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('palette platform: undo left') });
  });

  it('fails palette items in a game that cannot validate placement', async () => {
    const result = await c11Palette.run(fakeContext({ placementUnsupported: true }));
    expect(result).toMatchObject({ status: 'fail', detail: 'palette platform: placement is not supported' });
  });

  it('is unchecked, not passed, with an empty palette', async () => {
    const ctx = fakeContext({ manifest: { palette: { ...MANIFEST.palette, items: [] } } });
    expect((await c11Palette.run(ctx)).status).toBe('unchecked');
  });
});
