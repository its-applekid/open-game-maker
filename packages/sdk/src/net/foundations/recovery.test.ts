import { describe, expect, it } from 'vitest';

import { MAX_REPLAY_TICKS, RECOVERY_PER_SEC, RecoveryBook } from './recovery.js';

describe('recovery bookkeeping', () => {
  it('coalesces per scope and frees the slot when a response arrives', () => {
    const book = new RecoveryBook();
    expect(book.request('shared', 300, 1_000)).toEqual({ scope: 'shared', tick: 300 });
    expect(book.request('shared', 330, 1_100)).toBeUndefined();
    expect(book.request('seat', 330, 1_100, 1)).toEqual({ scope: 'seat', tick: 330, seat: 1 });
    book.settle('shared');
    expect(book.request('shared', 360, 1_200)).toEqual({ scope: 'shared', tick: 360 });
    expect(book.recoveries).toBe(3);
  });

  it('caps requests at four per second', () => {
    const book = new RecoveryBook();
    for (let index = 0; index < RECOVERY_PER_SEC; index += 1) {
      expect(book.request('shared', index, 1_000)).toBeDefined();
      book.settle('shared');
    }
    expect(book.request('shared', 99, 1_500)).toBeUndefined();
    expect(book.request('shared', 99, 2_001)).toBeDefined();
  });

  it('plans a replay inside the window and a hard resync beyond it', () => {
    const book = new RecoveryBook();
    expect(book.plan(300, 310)).toEqual({ mode: 'replay', replayTicks: 10 });
    expect(book.plan(300, 300)).toEqual({ mode: 'hard' });
    expect(book.plan(1, 1 + MAX_REPLAY_TICKS + 1)).toEqual({
      mode: 'hard',
      replayTicks: MAX_REPLAY_TICKS + 1,
    });
  });

  it('trips the breaker on the fourth hard resync inside sixty seconds', () => {
    const book = new RecoveryBook();
    book.recordResync(1_000);
    book.recordResync(2_000);
    book.recordResync(3_000);
    expect(book.desynced).toBe(false);
    book.recordResync(4_000);
    expect(book.desynced).toBe(true);
    expect(book.hardResyncs).toBe(4);
    expect(book.request('shared', 1, 5_000)).toBeUndefined();
  });

  it('forgets resyncs older than the window and resets per epoch', () => {
    const book = new RecoveryBook();
    for (let index = 0; index < 3; index += 1) book.recordResync(index * 1_000);
    book.recordResync(70_000);
    expect(book.desynced).toBe(false);
    book.reset();
    expect(book.hardResyncs).toBe(0);
    expect(book.desynced).toBe(false);
    expect(book.pending).toEqual([]);
  });
});
