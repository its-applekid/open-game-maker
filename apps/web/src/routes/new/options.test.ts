import { describe, expect, it } from 'vitest';

import { STEP_ORDER, STATIC_STEPS, scopeChoicesFrom, viewsFor } from './options';

describe('new game options', () => {
  it('keeps the designed step order and pick limits', () => {
    expect(STEP_ORDER).toEqual(['genre', 'vibe', 'family', 'world', 'players', 'view', 'talk']);
    expect(STATIC_STEPS.genre.options).toHaveLength(14);
    expect(STATIC_STEPS.genre.max).toBe(3);
    expect(STATIC_STEPS.vibe.options).toHaveLength(11);
    expect(STATIC_STEPS.world.options).toHaveLength(11);
    expect(STATIC_STEPS.players.options.map(({ id }) => id)).toEqual(['single', 'multi']);
  });

  it('filters views to both the selected family and genre defaults', () => {
    expect(viewsFor(['iso', 'follow'], ['platformer'])).toEqual(['follow']);
    expect(viewsFor(['iso', 'follow'], ['rhythm'])).toEqual(['iso', 'follow']);
  });

  it('serializes multi-picks and Other text into the landed scope contract', () => {
    expect(
      scopeChoicesFrom({
        genre: { picks: ['adventure', 'rpg'], other: 'delivery' },
        vibe: { picks: ['cozy'] },
        family: { picks: ['smallscaleint'] },
        world: { picks: ['sky'], other: 'rope bridges' },
        players: { picks: ['multi'] },
        view: { picks: ['iso'] },
      }),
    ).toEqual({
      genre: 'Adventure, RPG',
      vibe: 'Cozy',
      family: 'smallscaleint',
      world: 'Sky islands',
      players: 'multi',
      pov: 'iso',
      other: 'genre: delivery\nworld: rope bridges',
    });
  });
});
