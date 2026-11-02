import { describe, expect, it, vi } from 'vitest';

import { createAchievements } from './achievements.js';

function host() {
  return { events: { emit: vi.fn() } };
}

describe('achievements SDK', () => {
  it('deduplicates published awards called every frame', () => {
    const target = host();
    const achievements = createAchievements(target, 'published');

    for (let frame = 0; frame < 60; frame += 1) achievements.award('first-dungeon');

    expect(target.events.emit).toHaveBeenCalledOnce();
    expect(target.events.emit).toHaveBeenCalledWith('achievement', { op: 'award', key: 'first-dungeon' });
  });

  it('turns draft awards into one local test toast and no event', () => {
    const target = host();
    const toast = vi.fn();
    const achievements = createAchievements(target, 'draft', { toast });

    achievements.award('first-dungeon');
    achievements.award('first-dungeon');

    expect(target.events.emit).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith('(test)');
  });

  it('sends only monotonic progress increases', () => {
    const target = host();
    const achievements = createAchievements(target, 'published');

    achievements.progress('shrines', 3);
    achievements.progress('shrines', 2);
    achievements.progress('shrines', 5);

    expect(target.events.emit).toHaveBeenCalledTimes(2);
    expect(target.events.emit).toHaveBeenNthCalledWith(1, 'achievement', { op: 'progress', key: 'shrines', value: 3 });
    expect(target.events.emit).toHaveBeenNthCalledWith(2, 'achievement', { op: 'progress', key: 'shrines', value: 5 });
  });
});
