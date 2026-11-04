import type { AiurClient } from '@ogm/aiur-client';
import { schema } from '@ogm/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { answerVoiceCommand } from '../../src/voice/command-answer.js';
import { ids, NOW, worked } from '../budget/fixture.js';
import { makeApp } from '../helpers.js';

const target = {
  kind: 'build' as const,
  game_id: ids.game,
  job_id: ids.running,
  ticket: '7',
  creator_id: ids.creator,
};

function fixture() {
  const deps = worked();
  deps.db
    .update(schema.jobs)
    .set({ aiurRepo: 'owner/game', aiurIssueNumber: 7 })
    .where(eq(schema.jobs.id, ids.running))
    .run();
  deps.db
    .insert(schema.checkpoints)
    .values({
      decisionId: 'decision-1',
      jobId: ids.running,
      daemonSlug: 'owner-game',
      version: 3,
      question: 'Ship it?',
      options: JSON.stringify([
        { id: 'ship', label: 'Ship it' },
        { id: 'wait', label: 'Wait' },
      ]),
      status: 'open',
      openedAt: NOW.toISOString(),
    })
    .run();
  return deps;
}

describe('answerVoiceCommand', () => {
  it('routes a spoken option through the Aiur Decision API and closes the local Command', async () => {
    const deps = fixture();
    const decide = vi.fn().mockResolvedValue({ decision_id: 'decision-1' });
    deps.aiurClientForRepo = async () => ({ decide }) as never;

    await expect(
      answerVoiceCommand(deps, {
        target,
        command_id: 'decision-1',
        choice: 'Ship it',
        idempotency_key: 'voice-call-1',
      }),
    ).resolves.toEqual({ status: 'answered' });

    expect(decide).toHaveBeenCalledWith(
      'decision-1',
      expect.objectContaining({ option: 'ship', expected_version: 3, idempotency_key: 'voice-call-1' }),
    );
    expect(deps.db.select().from(schema.checkpoints).get()).toMatchObject({
      status: 'answered',
      answeredAt: expect.any(String),
    });
  });

  it('requires the internal credential before the HTTP route can answer', async () => {
    const deps = fixture();
    deps.config.voiceInternalSecret = 'voice-internal-secret-for-tests';
    const decide = vi.fn().mockResolvedValue({ decision_id: 'decision-1' });
    deps.aiurClientForRepo = async () => ({ decide }) as unknown as AiurClient;
    const { app } = await makeApp(deps);
    const body = JSON.stringify({
      target,
      command_id: 'decision-1',
      choice: 'ship',
      idempotency_key: 'voice-call-route',
    });

    const refused = await app.request('/internal/voice/command-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ogm-internal': 'wrong' },
      body,
    });
    expect(refused.status).toBe(401);
    expect(decide).not.toHaveBeenCalled();

    const answered = await app.request('/internal/voice/command-answer', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ogm-internal': 'voice-internal-secret-for-tests',
      },
      body,
    });
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({ status: 'answered' });
  });

  it('returns stale without calling Aiur when the Command is no longer open', async () => {
    const deps = fixture();
    deps.db.update(schema.checkpoints).set({ status: 'answered' }).run();
    const decide = vi.fn();
    deps.aiurClientForRepo = async () => ({ decide }) as never;

    await expect(
      answerVoiceCommand(deps, {
        target,
        command_id: 'decision-1',
        choice: 'ship',
        idempotency_key: 'voice-call-2',
      }),
    ).resolves.toEqual({ status: 'stale' });
    expect(decide).not.toHaveBeenCalled();
  });

  it('rejects a forged target and an unknown option before contacting Aiur', async () => {
    const deps = fixture();
    const decide = vi.fn();
    deps.aiurClientForRepo = async () => ({ decide }) as never;

    await expect(
      answerVoiceCommand(deps, {
        target: { ...target, ticket: '8' },
        command_id: 'decision-1',
        choice: 'ship',
        idempotency_key: 'voice-call-3',
      }),
    ).resolves.toEqual({ status: 'failed' });
    await expect(
      answerVoiceCommand(deps, {
        target,
        command_id: 'decision-1',
        choice: 'delete everything',
        idempotency_key: 'voice-call-4',
      }),
    ).resolves.toEqual({ status: 'failed' });
    expect(decide).not.toHaveBeenCalled();
  });
});
