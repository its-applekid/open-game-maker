import { describe, expect, it, vi } from 'vitest';

import type { SaveSlot } from '@ogm/contracts/browser';

import { saveSlotOptions, storeSaveWrite } from './saves';

const gameId = 'g_01BX5ZZKBKACTAV9WEVGEMMVRZ';

describe('platform saves', () => {
  it('keeps auto and manual slots in contract order even when only some have revisions', () => {
    const slots = [
      { slotId: '3', headRevision: 8 },
      { slotId: 'auto', headRevision: 12 },
    ] as SaveSlot[];

    expect(saveSlotOptions(slots).map(({ id, slot }) => [id, slot?.headRevision])).toEqual([
      ['auto', 12],
      ['1', undefined],
      ['2', undefined],
      ['3', 8],
    ]);
  });

  it('stores an identity-free game payload in the host-selected slot with a concurrency revision', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const payload = { saveSchemaVersion: 2, data: { room: 'crypt' } };

    await storeSaveWrite(gameId, '3', payload, [{ slotId: '3', headRevision: 8 } as SaveSlot], write);

    expect(write).toHaveBeenCalledWith(gameId, '3', payload, 8);
    expect(write.mock.calls[0]?.[2]).not.toHaveProperty('userId');
  });
});
