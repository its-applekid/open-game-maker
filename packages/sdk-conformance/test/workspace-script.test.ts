import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const rootPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
  scripts: { conformance: string };
};

describe('workspace conformance script', () => {
  it('builds and checks every installed template', () => {
    for (const template of ['game-2d', 'game-3d', 'game-multiplayer']) {
      expect(rootPackage.scripts.conformance).toContain(`--filter "@gm/template-${template}^..."`);
      expect(rootPackage.scripts.conformance).toContain(`check templates/${template}`);
    }
  });
});
