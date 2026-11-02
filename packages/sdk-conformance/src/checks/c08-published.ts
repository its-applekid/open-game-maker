import type { Check } from '../types.js';
import { fail, pass, withSession } from './util.js';

/** The debug adapter's fingerprints (OGM-022 `installGlobals`); a published bundle must contain none. */
export const DEBUG_PATTERNS = [/render_game_to_text/, /\b__gm\b/];

/** A4 §10.3 (8): the published build has no debug adapter: no globals, no bundled adapter, `test.*` refused. */
export const c08Published: Check = {
  id: 'C8',
  name: 'published-no-debug',
  async run(ctx) {
    if (ctx.publishedBundle.length === 0) return fail('the published build has no JavaScript files');
    for (const file of ctx.publishedBundle) {
      const pattern = DEBUG_PATTERNS.find((candidate) => candidate.test(file.text));
      if (pattern) return fail(`${file.path} contains ${pattern.source}`);
    }
    return withSession(ctx, { build: 'published', capabilities: [] }, async (session) => {
      const globals = await session.globals();
      if (globals.length > 0) return fail(`published window exposes ${globals.join(', ')}`);
      const refused = await session.text().then(
        () => false,
        () => true,
      );
      if (!refused) return fail('published build answered test.renderGameToText');
      return pass(`${ctx.publishedBundle.length} bundle files clean; no globals; test requests refused`);
    });
  },
};
