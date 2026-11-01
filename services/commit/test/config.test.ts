import { describe, expect, it } from 'vitest';

import { parseRepository } from '../src/platform-repo.js';

describe('parseRepository', () => {
  it('accepts one fixed owner/repository pair', () => {
    expect(parseRepository('its-everdred/open-game-maker-2000')).toEqual({
      owner: 'its-everdred',
      name: 'open-game-maker-2000',
    });
  });

  it.each(['repo', 'owner/repo/extra', '/repo', 'owner/../repo', 'owner/..'])('rejects %s', (value) => {
    expect(() => parseRepository(value)).toThrow('OGM_PLATFORM_ISSUE_REPO');
  });
});
