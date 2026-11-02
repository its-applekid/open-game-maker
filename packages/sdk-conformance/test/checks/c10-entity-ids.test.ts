import { describe, expect, it } from 'vitest';

import { c10EntityIds } from '../../src/checks/c10-entity-ids.js';
import { fakeContext } from '../fake-session.js';

const previous = { controlIds: [], entityIds: ['platform_01', 'platform_02'] };

describe('C10 entity-ids-stable', () => {
  it('fails an entity id dropped without retirement', async () => {
    const result = await c10EntityIds.run(fakeContext({}, { previous }));
    expect(result).toMatchObject({ status: 'fail', detail: 'entity platform_02 dropped without retirement' });
  });

  it('passes once the dropped id is retired', async () => {
    const ctx = fakeContext({ manifest: { overrides: { aliases: {}, retired: ['platform_02'] } } }, { previous });
    expect((await c10EntityIds.run(ctx)).status).toBe('pass');
  });

  it('is unchecked without a previous build', async () => {
    expect((await c10EntityIds.run(fakeContext())).status).toBe('unchecked');
  });
});
