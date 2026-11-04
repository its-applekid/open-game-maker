import { AiurHttpError } from '@ogm/aiur-client';
import type { VoiceCommandAnswerRequest, VoiceCommandAnswerResponse } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { and, eq } from 'drizzle-orm';

import type { AppDeps } from '../app/types.js';
import { parseCommandOptions, type CommandOption } from '../checkpoints/options.js';

function selectedOption(available: CommandOption[], choice: string): CommandOption | null {
  const exact = available.find(({ id, label }) => id === choice || label === choice);
  if (exact) return exact;
  const folded = choice.toLocaleLowerCase();
  const matches = available.filter(
    ({ id, label }) => id.toLocaleLowerCase() === folded || label.toLocaleLowerCase() === folded,
  );
  return matches.length === 1 ? matches[0]! : null;
}

export async function answerVoiceCommand(
  deps: AppDeps,
  request: VoiceCommandAnswerRequest,
): Promise<VoiceCommandAnswerResponse> {
  const target = request.target;
  if (target.kind !== 'build') return { status: 'failed' };
  const job = deps.db.select().from(schema.jobs).where(eq(schema.jobs.id, target.job_id)).get();
  if (
    !job ||
    job.gameId !== target.game_id ||
    job.creatorId !== target.creator_id ||
    job.aiurRepo === null ||
    job.aiurIssueNumber === null ||
    String(job.aiurIssueNumber) !== target.ticket
  ) {
    return { status: 'failed' };
  }

  const command = deps.db
    .select()
    .from(schema.checkpoints)
    .where(and(eq(schema.checkpoints.decisionId, request.command_id), eq(schema.checkpoints.jobId, job.id)))
    .get();
  if (!command || command.status !== 'open') return { status: 'stale' };
  const available = parseCommandOptions(command.options);
  if (available === null) return { status: 'failed' };
  const option = available.length === 0 ? null : selectedOption(available, request.choice);
  if (available.length > 0 && option === null) return { status: 'failed' };

  try {
    const client = await deps.aiurClientForRepo(job.aiurRepo);
    await client.decide(command.decisionId, {
      ...(option === null ? { response: request.choice } : { option: option.id }),
      expected_version: command.version,
      idempotency_key: request.idempotency_key,
      rationale: 'Creator answered the Command in two-way voice',
      confidence: 100,
      alternatives_considered: [],
      reversibility_belief: 'reversible',
    });
  } catch (error) {
    if (error instanceof AiurHttpError && error.status === 409) return { status: 'stale' };
    deps.log({ event: 'voice-command-answer-failed', jobId: job.id, error: (error as Error).name });
    return { status: 'failed' };
  }

  deps.db
    .update(schema.checkpoints)
    .set({ status: 'answered', answeredAt: new Date().toISOString() })
    .where(and(eq(schema.checkpoints.decisionId, command.decisionId), eq(schema.checkpoints.status, 'open')))
    .run();
  return { status: 'answered' };
}
