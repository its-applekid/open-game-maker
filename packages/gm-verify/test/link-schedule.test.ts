import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ChannelName } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { BAD_LINK, CLEAN_LINK, createLinkSchedule, type Delivery, type LinkConfig } from '../src/link/schedule.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/link/seed-1234.json', import.meta.url));
const CHANNELS: ChannelName[] = ['input', 'state', 'event'];

type Fixture = { channel: ChannelName; link: LinkConfig; decisions: Delivery & { index: number }[] };

function fixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
}

function decisions(config: LinkConfig, channel: ChannelName, count = 200): Delivery[] {
  const decide = createLinkSchedule(config);
  return Array.from({ length: count }, (_, index) => decide(channel, index));
}

describe('the seeded link schedule', () => {
  it('replays the committed 200-decision fixture byte for byte', () => {
    const committed = fixture();
    const decide = createLinkSchedule(committed.link);

    expect(committed.decisions).toHaveLength(200);
    expect(committed.decisions.map(({ index }) => ({ index, ...decide(committed.channel, index) }))).toEqual(
      committed.decisions,
    );
  });

  it('gives one decision per message that does not depend on the order the decisions are asked in', () => {
    const decide = createLinkSchedule(BAD_LINK);
    const row = fixture().decisions[137]!;

    expect(decide('input', 137)).toEqual({ dropped: row.dropped, delayMs: row.delayMs, reordered: row.reordered });
    expect(decide('input', 137)).toEqual(decide('input', 137));
  });

  it('is a pure function of its config, and a different seed differs', () => {
    expect(decisions(BAD_LINK, 'input')).toEqual(decisions({ ...BAD_LINK }, 'input'));
    expect(decisions({ ...BAD_LINK, seed: 1235 }, 'input')).not.toEqual(decisions(BAD_LINK, 'input'));
  });

  it('impairs nothing on the clean profile', () => {
    for (const channel of CHANNELS) {
      expect(
        decisions(CLEAN_LINK, channel).filter(
          ({ dropped, delayMs, reordered }) => dropped || delayMs !== 0 || reordered,
        ),
      ).toEqual([]);
    }
  });

  it('keeps the event channel reliable and ordered: never dropped, never reordered, at any loss', () => {
    const lossy = { ...BAD_LINK, seed: 7, lossPct: 50, reorderPct: 50 };

    expect(decisions(lossy, 'event').some(({ dropped }) => dropped)).toBe(false);
    expect(decisions(lossy, 'event').some(({ reordered }) => reordered)).toBe(false);
    expect(decisions(lossy, 'input').some(({ dropped }) => dropped)).toBe(true);
    expect(decisions(lossy, 'input').some(({ reordered }) => reordered)).toBe(true);
  });

  it('delays inside latency plus or minus jitter on every channel', () => {
    for (const channel of CHANNELS) {
      for (const { delayMs } of decisions(BAD_LINK, channel)) {
        expect(delayMs).toBeGreaterThanOrEqual(BAD_LINK.latencyMs - BAD_LINK.jitterMs);
        expect(delayMs).toBeLessThanOrEqual(BAD_LINK.latencyMs + BAD_LINK.jitterMs);
      }
    }
  });
});
