import { describe, expect, it } from 'vitest';

import { EventInbox } from '../src/net-events.js';
import { LIMITS_V2 } from '../src/room.js';

const event = (from: number, seq: number, id = `e${from}-${seq}`) => ({ from, seq, id });

describe('EventInbox', () => {
  it('applies the same (from, id) once', () => {
    const inbox = new EventInbox();
    expect(inbox.apply(event(1, 1))).toBe('applied');
    expect(inbox.apply(event(1, 1))).toBe('duplicate');
    expect(inbox.apply(event(1, 1, 'e1-1-b'))).toBe('applied');
  });

  it('reports a jump as a gap and lists the skipped sequence numbers', () => {
    const inbox = new EventInbox();
    expect(inbox.apply(event(2, 4))).toBe('applied');
    expect(inbox.apply(event(2, 7))).toBe('gap');
    expect(inbox.missing()).toEqual([{ from: 2, seqs: [5, 6] }]);
    expect(inbox.apply(event(2, 5))).toBe('applied');
    expect(inbox.missing()).toEqual([{ from: 2, seqs: [6] }]);
    expect(inbox.apply(event(2, 6))).toBe('applied');
    expect(inbox.missing()).toEqual([]);
  });

  it('keeps senders independent', () => {
    const inbox = new EventInbox();
    inbox.apply(event(1, 1));
    inbox.apply(event(2, 1));
    expect(inbox.apply(event(1, 2))).toBe('applied');
    expect(inbox.apply(event(2, 4))).toBe('gap');
    expect(inbox.missing()).toEqual([{ from: 2, seqs: [2, 3] }]);
  });

  it('bounds the per-sender window so a long match does not grow without limit', () => {
    const inbox = new EventInbox(4);
    for (let seq = 1; seq <= 12; seq += 1) inbox.apply(event(0, seq));
    expect(inbox.apply(event(0, 12))).toBe('duplicate');
    expect(inbox.apply(event(0, 9))).toBe('duplicate');
    expect(inbox.apply(event(0, 1))).toBe('applied');
    expect(LIMITS_V2.eventHistory).toBe(256);
  });

  it('forgets every stream when the epoch ends', () => {
    const inbox = new EventInbox();
    expect(inbox.apply(event(1, 9))).toBe('applied');
    expect(inbox.apply(event(1, 12))).toBe('gap');
    inbox.reset();
    expect(inbox.missing()).toEqual([]);
    expect(inbox.apply(event(1, 9))).toBe('applied');
  });
});
