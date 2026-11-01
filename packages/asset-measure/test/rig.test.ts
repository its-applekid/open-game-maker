import { describe, expect, it } from 'vitest';

import { rigIdFromJoints } from '../src/index.js';

describe('rigIdFromJoints', () => {
  it('ignores non-joint wrapper nodes but changes when a joint is renamed', () => {
    const orc = [
      { name: 'Hips', parentJoint: null },
      { name: 'Spine', parentJoint: 'Hips' },
      { name: 'Head', parentJoint: 'Spine' },
    ];
    const human = orc.map((joint) => ({ ...joint }));
    const renamed = human.map((joint) => (joint.name === 'Head' ? { name: 'Skull', parentJoint: joint.parentJoint } : joint));

    expect(rigIdFromJoints(orc)).toBe(rigIdFromJoints(human));
    expect(rigIdFromJoints(renamed)).not.toBe(rigIdFromJoints(human));
  });
});
