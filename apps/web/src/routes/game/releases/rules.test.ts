import { describe, expect, it } from 'vitest';

import { ApiError } from '../../../lib/api/client';
import { changelogText, releaseErrorMessage } from './rules';

describe('release rules', () => {
  it('assembles the server changelog into one editable public value', () => {
    expect(
      changelogText({
        summary: 'A better dungeon',
        items: [
          { kind: 'add', text: 'Added a boss room' },
          { kind: 'fix', text: 'Fixed the bridge' },
        ],
      }),
    ).toBe('A better dungeon\n\nAdded a boss room\nFixed the bridge');
  });

  it('retains server gate and pointer reasons for the dialog', () => {
    expect(releaseErrorMessage(new ApiError(409, { error: 'protected_pointer', rule: 'tag must advance' }))).toContain(
      'tag must advance',
    );
    expect(releaseErrorMessage(new ApiError(422, 'asset boss.glb is not publishable'))).toBe(
      'asset boss.glb is not publishable',
    );
  });
});
