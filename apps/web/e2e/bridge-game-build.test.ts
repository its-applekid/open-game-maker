// @vitest-environment node
import { readFileSync } from 'node:fs';

import { DesignDocSchema, gameManifestSchema } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

/* The e2e games host serves this fixture as a published build, so it must carry the files a real build has. */
const read = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`fixtures/bridge-game/${file}`, import.meta.url), 'utf8'));

describe('bridge-game fixture build', () => {
  it('has a manifest.json the contracts schema accepts', () => {
    expect(gameManifestSchema.safeParse(read('manifest.json')).error?.issues).toBeUndefined();
  });

  it('has a design/design.json the contracts schema accepts', () => {
    expect(DesignDocSchema.safeParse(read('design/design.json')).error?.issues).toBeUndefined();
  });
});
