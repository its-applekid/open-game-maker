// @vitest-environment node
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

/** Bundles the SDK core the way a template build does: __GM_BUILD__ defined, dynamic imports split. */
async function bundledJs(kind: 'draft' | 'published'): Promise<string> {
  const result = await build({
    entryPoints: ['src/core/index.ts'],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
    write: false,
    outdir: 'out',
    logLevel: 'silent',
    define: { __GM_BUILD__: JSON.stringify(kind) },
  });
  return result.outputFiles.map((file) => file.text).join('\n');
}

// C8: the published bundle must not contain the debug adapter at all, not just skip installing it.
describe('boot bundle', () => {
  it('leaves the debug adapter out of a published bundle', async () => {
    expect(await bundledJs('draft')).toContain('render_game_to_text');

    const published = await bundledJs('published');
    expect(published).not.toContain('render_game_to_text');
    expect(published).not.toMatch(/\b__gm\b/);
  });
});
