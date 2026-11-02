import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

import { describe, expect, it } from 'vitest';

import { replay } from '../src/replay.js';

describe('replay without outDir', () => {
  // The repair worker runs one replay per report; a leaked gm-replay-* dir per call fills the host's tmp.
  it('removes the temp dir it wrote the script into', async () => {
    const result = await replay(
      { seed: 1, keyframe: { tick: 0, state: {} }, actions: [], errors: [] },
      { serveDir: '/nonexistent' },
    );

    expect(result.class).toBe('not_reproducible');
    expect(dirname(result.scriptPath)).toContain('gm-replay-');
    expect(existsSync(dirname(result.scriptPath))).toBe(false);
  });
});
