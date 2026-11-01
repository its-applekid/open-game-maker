import { describe, expect, it } from 'vitest';

import type { MapLayoutSpec } from '../src/card.js';
import { layoutMetrics } from '../src/layout.js';
import { loadJson } from './helpers.js';

describe('layout metrics', () => {
  it('matches the computed tags on the ProFantasy example', () => {
    const spec = loadJson<MapLayoutSpec>('fixtures/cards/layout-profantasy-example-dungeon.json');
    const metrics = layoutMetrics(spec);
    expect(metrics).toMatchObject({
      loop_count: spec.tags.computed.loop_count,
      dead_end_count: spec.tags.computed.dead_end_count,
      room_count: spec.tags.computed.room_count,
      connection_count: spec.tags.computed.connection_count,
      total_area_cells: spec.tags.computed.total_area_cells,
      secret_count: spec.tags.computed.secret_count,
      areas_ok: true,
      endpoints_ok: true,
    });
  });

  it('detects graph drift when a connection is removed', () => {
    const spec = loadJson<MapLayoutSpec>('fixtures/cards/layout-profantasy-example-dungeon.json');
    const changed = structuredClone(spec);
    changed.connections.splice(7, 1);
    expect(layoutMetrics(changed).loop_count).not.toBe(spec.tags.computed.loop_count);
  });
});
