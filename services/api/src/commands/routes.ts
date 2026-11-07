import { AiurHttpError } from '@ogm/aiur-client';
import { Hono } from 'hono';
import { z } from 'zod';

import { GameCommand, type GameCommandsPage } from '@ogm/contracts';

import { HttpError } from '../app/errors.js';
import { parseBody } from '../app/validate.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { authorizedGame } from '../games/authorize.js';
import { getChatRuntime } from '../build-chat/routes.js';
import { getChatRow, listCheckpoints, parseCheckpoint, toMessage, type MediaSigner } from '../build-chat/store.js';
import { listJobs } from '../jobs/repo.js';
import { gameCommandsFromAiur } from './aiur.js';

export const prefix = '/api/v1';

// The Commands inbox (M3): one game's open aiur Commands across its tickets, in the shape the embeddable
// `<aiur-commands>` component consumes (aiur#7487). A job's Commands answer through the job's checkpoint route; a
// registered game's Commands have no job and answer through this route, which calls aiur's Decision API directly.

const AnswerCommandBody = z
  .object({
    option_id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
    // The version the player saw. Aiur refuses an answer to a newer version, so a stale inbox shows its conflict.
    version: z.number().int().positive(),
  })
  .strict();

async function optionMedia(deps: AppDeps, jobId: string, mediaId: string, sign: MediaSigner) {
  const row = getChatRow(deps.sqlite, mediaId);
  if (row === null || row.jobId !== jobId) return undefined;
  return (await toMessage(row, sign)).media;
}

export default new Hono<ApiBindings>()
  .get('/games/:gameId/commands', async (c) => {
    const game = authorizedGame(c, 'game.edit');
    const deps = c.get('deps');
    const { sign } = getChatRuntime(deps);
    const commands: GameCommand[] = [];
    const jobs = listJobs(deps.db, game.id);
    const jobTickets = new Set(
      jobs.flatMap((job) => (job.aiurIssueNumber === null ? [] : [String(job.aiurIssueNumber)])),
    );

    for (const job of jobs) {
      for (const row of listCheckpoints(deps.sqlite, job.id)) {
        const checkpoint = parseCheckpoint(row);
        // A Command is answerable only once aiur's decision is correlated (decision id and version known).
        if (!checkpoint || checkpoint.status !== 'open') continue;
        if (checkpoint.decision_id === '' || checkpoint.version === undefined) continue;
        const options = await Promise.all(
          checkpoint.options.map(async (option) => {
            const media =
              option.media_id === undefined ? undefined : await optionMedia(deps, job.id, option.media_id, sign);
            return { id: option.id, label: option.label, ...(media === undefined ? {} : { media }) };
          }),
        );
        // One malformed checkpoint row is left out of the inbox rather than failing every Command in the game.
        const command = GameCommand.safeParse({
          job_id: job.id,
          ticket: job.aiurIssueNumber === null ? null : String(job.aiurIssueNumber),
          title: job.plan.title,
          checkpoint_id: checkpoint.checkpoint_id ?? row.id,
          decision_id: checkpoint.decision_id,
          version: checkpoint.version,
          question: checkpoint.question,
          options,
          ...(checkpoint.recommend === undefined ? {} : { recommend: checkpoint.recommend }),
          blocking: checkpoint.blocking ?? false,
          opened_at: row.at,
        });
        if (command.success) commands.push(command.data);
      }
    }

    // A registered game's Commands belong to no job. A decision already listed from a job's checkpoint stays the
    // job's, so one Command never appears twice.
    const listed = new Set(commands.map((command) => command.decision_id));
    for (const command of await gameCommandsFromAiur(deps, game.id, jobTickets)) {
      if (!listed.has(command.decision_id)) commands.push(command);
    }

    const page: GameCommandsPage = {
      commands: commands.sort((left, right) => right.opened_at.localeCompare(left.opened_at)),
    };
    return c.json(page);
  })
  // A Command with no job: the player answered one the game's own aiur instance holds. Aiur's canonical Decision API
  // validates the option and the version, so an answer from here lands exactly as one from the aiur dashboard would.
  .post('/games/:gameId/commands/:decisionId/answer', async (c) => {
    const game = authorizedGame(c, 'game.edit');
    const deps = c.get('deps');
    const body = await parseBody(c, AnswerCommandBody);
    const decisionId = c.req.param('decisionId');
    let client;
    try {
      client = await deps.aiurClientForGame(game.id);
    } catch (error) {
      if (error instanceof HttpError) throw new HttpError(409, 'daemon_not_found');
      throw error;
    }
    try {
      await client.decide(decisionId, {
        option: body.option_id,
        expected_version: body.version,
        idempotency_key: `${decisionId}:${body.version}`,
        rationale: 'Creator answered the Command in the game inbox',
        confidence: 100,
        alternatives_considered: [],
        reversibility_belief: 'reversible',
      });
    } catch (error) {
      // Another writer answered first: aiur's status is final and the inbox refetches.
      if (error instanceof AiurHttpError && error.status === 409) {
        return c.json({ status: 'conflict' as const, by: 'other' as const }, 409);
      }
      deps.log({ event: 'game_command_answer_failed', gameId: game.id, decisionId, error: (error as Error).name });
      throw new HttpError(502, 'aiur_answer_failed');
    }
    return c.json({ status: 'answered' as const, decision_id: decisionId, option_id: body.option_id }, 200);
  });
