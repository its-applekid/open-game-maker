import { Hono, type Context } from 'hono';

import { GameCommand, type GameCommandsPage } from '@ogm/contracts';
import { authorize } from '@ogm/policy';

import { actorFromPrincipal, requireAuthorization } from '../accounts/families.js';
import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { getChatRuntime } from '../build-chat/routes.js';
import { getChatRow, listCheckpoints, parseCheckpoint, toMessage, type MediaSigner } from '../build-chat/store.js';
import { findGameForFamily, hasGameGrant, type GameRow } from '../games/games.js';
import { listJobs } from '../jobs/repo.js';

export const prefix = '/api/v1';

// The Commands inbox (M3): one game's open aiur Commands across its tickets, in the shape the embeddable
// `<aiur-commands>` component consumes (aiur#7487). Answers go through the job's checkpoint route, which
// calls aiur's canonical Decision API; this route only reads.
function authorizedGame(c: Context<ApiBindings>): GameRow {
  const principal = requirePrincipal(c, ['user']);
  const gameId = c.req.param('gameId');
  if (!gameId) throw new HttpError(400, 'invalid_request');
  const game = findGameForFamily(c.get('deps').db, gameId, principal.familyId);
  requireAuthorization(
    authorize(actorFromPrincipal(principal), 'game.edit', {
      familyId: game.familyId,
      ownerId: game.ownerId,
      visibility: game.visibility,
      granted: hasGameGrant(c.get('deps').db, game.id, principal.userId),
    }),
  );
  return game;
}

async function optionMedia(deps: AppDeps, jobId: string, mediaId: string, sign: MediaSigner) {
  const row = getChatRow(deps.sqlite, mediaId);
  if (row === null || row.jobId !== jobId) return undefined;
  return (await toMessage(row, sign)).media;
}

export default new Hono<ApiBindings>().get('/games/:gameId/commands', async (c) => {
  const game = authorizedGame(c);
  const deps = c.get('deps');
  const { sign } = getChatRuntime(deps);
  const commands: GameCommand[] = [];

  for (const job of listJobs(deps.db, game.id)) {
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

  const page: GameCommandsPage = {
    commands: commands.sort((left, right) => right.opened_at.localeCompare(left.opened_at)),
  };
  return c.json(page);
});
