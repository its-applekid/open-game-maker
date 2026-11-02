import type { ControlDecl, TriageClaim } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { editorHint } from '../src/editor-hint.js';
import { promiseArtifact } from '../src/promise-gen.js';
import { attemptTwoComment } from '../src/ticket-body.js';
import { postReplaySignature, triageResult } from '../src/triage.js';

const reportId = 'r_10000000-0000-4000-8000-000000000001';
const jobId = 'j_10000000-0000-4000-8000-000000000001';
const claim: TriageClaim = {
  reportId,
  jobId,
  gameId: 'g_10000000-0000-4000-8000-000000000001',
  buildHash: 'a'.repeat(64),
  route: 'game_repair',
  bundleUrl: 'https://private.example.test/signed?secret=nope',
};
const control: ControlDecl = {
  id: 'enemySpeed',
  label: 'Goblin speed for Alice',
  help: 'Private prose',
  scope: 'global',
  path: '/enemy/speed',
  widget: { kind: 'slider', min: 1, max: 10 },
  default: 5,
};

describe('repair triage domain', () => {
  it('maps a tuning complaint only to a declared control with a fixed reason', () => {
    expect(editorHint('the enemy is too fast', [control])).toEqual({
      controlId: 'enemySpeed',
      suggestion: 'decrease',
      reason: 'Complaint matches the declared enemySpeed control.',
    });
    expect(JSON.stringify(editorHint('the enemy is too fast', [control]))).not.toContain('Alice');
    expect(editorHint('make the dragon friendlier', [control])).toBeUndefined();
  });

  it('returns an editor hint when replay finds state drift for a declared control', async () => {
    const result = await triageResult({
      claim: { ...claim, text: 'the enemy is too fast' },
      bundle: { seed: 7, actions: [], errors: [], probes: {}, controls: [control] },
      replay: {
        class: 'reproduces_no_error',
        reason: 'state_mismatch',
        errorsSeen: [],
        finalState: { speed: 10 },
        finalProbes: { speed: 10 },
        scriptPath: '/private/replay.json',
        durationMs: 11,
      },
      diagnosticsKey: 'pending',
      findOpen: async () => null,
    });

    expect(result.editorHint).toMatchObject({ controlId: 'enemySpeed', suggestion: 'decrease' });
    expect(result).not.toHaveProperty('ticket');
  });

  it('generates a two-import promise whose JSON contains only replay-safe fields', () => {
    const signature = 'b'.repeat(64);
    const artifact = promiseArtifact(signature, {
      seed: 7,
      keyframe: { tick: 0, state: { alive: true } },
      actions: [{ tick: 11, action: 'jump', phase: 'down' }],
      errors: [{ message: 'TypeError: planted' }],
      probes: { alive: true },
    });

    expect(artifact.spec.match(/^import /gm)).toHaveLength(2);
    expect(artifact.spec).toBe(
      `import { promiseTest } from '@gm/sdk/test';\nimport replay from './${signature}.replay.json';\npromiseTest(replay);\n`,
    );
    expect(Object.keys(JSON.parse(artifact.replay))).toEqual(['seed', 'keyframe', 'actions', 'expectedError']);
  });

  it('prepares a private fallback while marking equivalent replay evidence for dedupe', async () => {
    const replay = {
      class: 'reproduces_with_error' as const,
      errorsSeen: ['TypeError: cannot read vy at https://private/path.js:99'],
      finalState: { alive: false },
      finalProbes: { alive: false },
      scriptPath: '/private/replay.json',
      durationMs: 17,
    };
    const bundle = {
      seed: 7,
      keyframe: { tick: 0, state: { save: 'PRIVATE_STATE' } },
      actions: [{ tick: 11, action: 'jump', phase: 'down' as const }],
      errors: [{ message: 'TypeError: cannot read vy' }],
      probes: { alive: false },
    };
    const signature = postReplaySignature(replay.errorsSeen[0]!, replay.class, []);
    const result = await triageResult({
      claim,
      bundle,
      replay,
      diagnosticsKey: 'sha256:' + 'c'.repeat(64),
      findOpen: async (value) => (value === signature ? 'j_20000000-0000-4000-8000-000000000002' : null),
    });

    expect(result).toMatchObject({ signature, dedupedInto: 'j_20000000-0000-4000-8000-000000000002' });
    expect(result.ticket).toBeDefined();
    expect(result.promise).toBeDefined();
  });

  it('creates one redacted repair ticket with exact markers and acceptance text', async () => {
    const privateValues = ['Alice Example', 'SCREEN_BYTES', 'PRIVATE_STATE', 'jump-frame-secret'];
    const bundle = {
      seed: 7,
      keyframe: { tick: 0, state: { save: privateValues[2] } },
      actions: [{ tick: 11, action: privateValues[3]!, phase: 'down' as const }],
      errors: [{ message: 'TypeError: cannot read vy' }],
      probes: { alive: false },
      words: privateValues[0],
      screenshot: privateValues[1],
    };
    const result = await triageResult({
      claim,
      bundle,
      replay: {
        class: 'reproduces_with_error',
        errorsSeen: ['TypeError: cannot read vy'],
        finalState: { alive: false },
        finalProbes: { alive: false },
        scriptPath: '/private/replay.json',
        durationMs: 17,
      },
      diagnosticsKey: 'sha256:' + 'c'.repeat(64),
      findOpen: async () => null,
    });

    expect(result.ticket?.body).toContain(`gm-report:${reportId}`);
    expect(result.ticket?.body).toContain(`gm-job:${jobId}`);
    expect(result.ticket?.body).toContain(`<!-- gm-job:${jobId} gm-ticket:repair gm-sig:`);
    expect(result.ticket?.body).toContain('## Load skills\n- gm-repair\n- gm-verify');
    expect(result.ticket?.body).toContain('gm check and gm test green');
    for (const value of privateValues) expect(result.ticket?.body).not.toContain(value);
    expect(result.promise).toMatchObject({
      specPath: `promises/${result.signature}.spec.ts`,
      replayPath: `promises/${result.signature}.replay.json`,
    });
  });

  it('signs the reproduced class and only the first three differing probe keys', () => {
    const error = 'TypeError: cannot read vy';
    const one = postReplaySignature(error, 'reproduces_with_error', ['a', 'b', 'c', 'd']);

    expect(one).toBe(postReplaySignature(error, 'reproduces_with_error', ['a', 'b', 'c']));
    expect(one).not.toBe(postReplaySignature(error, 'reproduces_no_error', ['a', 'b', 'c']));
  });

  it('formats the bounded second-attempt rework comment', () => {
    expect(attemptTwoComment('expected alive to be true')).toBe(
      'Attempt 2 of 2: the promise test still fails: expected alive to be true',
    );
  });
});
