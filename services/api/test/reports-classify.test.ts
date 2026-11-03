import { describe, expect, it } from 'vitest';

import { classify, type ClassifyInput } from '../src/reports/classify.js';
import { crash, ids } from './reports-helpers.js';

const none = { seenInOtherGame: false, wrongBehaviourCount: 0 };
const run = (report: ClassifyInput['report'], existing = none) => classify({ report, existing });
const frame = (file: string, fn = 'f') => ({ file, line: 1, fn });

describe('report classification (first rule wins)', () => {
  it('rule 1: a top-3 frame in the host is a platform bug, even after game frames', () => {
    const report = crash();
    report.error.frames = [frame(`/g/${ids.game}/b_1/a.js`), frame('@ogm/host/bridge.js')];
    expect(run(report)).toMatchObject({
      route: 'platform',
      reproduction: 'crash_with_error',
      reason: 'frame_outside_game',
    });
  });

  it.each([
    'https://makeopen.games/assets/index.js',
    '@gm/host/frame.js',
    `/g/${ids.otherGame}/b_1/main.js`,
    'https://cdn.example.test/lib.js',
  ])('rule 1: %s is outside the game', (file) => {
    const report = crash();
    report.error.frames = [frame(file)];
    expect(run(report).route).toBe('platform');
  });

  it('rule 1 looks at the top three frames only', () => {
    const report = crash();
    const inGame = frame(`/g/${ids.game}/b_1/a.js`);
    report.error.frames = [inGame, inGame, inGame, frame('@ogm/host/x.js')];
    expect(run(report).route).toBe('game_repair');
  });

  it('rule 2: the same error already reported from another game is a platform bug', () => {
    expect(run(crash(), { ...none, seenInOtherGame: true })).toMatchObject({
      route: 'platform',
      reason: 'repeats_across_games',
    });
  });

  it('rule 3: a crash in the game goes to game repair', () => {
    expect(run(crash())).toEqual({ route: 'game_repair', reproduction: 'crash_with_error', reason: 'crash_in_game' });
  });

  it('rule 3: SDK-only frames are ambiguous and go to game repair first', () => {
    const report = crash();
    report.error.frames = [frame('@gm/sdk/runtime.js')];
    expect(run(report).route).toBe('game_repair');
  });

  it.each(['the enemy is too fast', 'I want more coins', 'set the speed to two'])(
    'rule 4: "%s" is an editor hint',
    (text) => {
      expect(run({ gameId: ids.game, text })).toMatchObject({ route: 'editor_hint', reproduction: 'not_reproducible' });
    },
  );

  it('rule 5: wrong behaviour is stored until the third matching report', () => {
    const report = { gameId: ids.game, text: 'jumping feels wrong' };
    expect(run(report, { ...none, wrongBehaviourCount: 1 })).toMatchObject({
      route: 'stored',
      reproduction: 'wrong_behaviour',
    });
    expect(run(report, { ...none, wrongBehaviourCount: 2 })).toMatchObject({
      route: 'game_repair',
      reproduction: 'wrong_behaviour',
    });
  });

  it('rule 6: nothing to go on is stored as not reproducible', () => {
    expect(run({ gameId: ids.game })).toMatchObject({ route: 'stored', reproduction: 'not_reproducible' });
    expect(run({ gameId: ids.game, text: '   ' }).route).toBe('stored');
  });
});
