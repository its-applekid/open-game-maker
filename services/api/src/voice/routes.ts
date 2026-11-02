import { Hono } from 'hono';

import { VoiceTokenRequest, type VoiceTokenResponse } from '@ogm/contracts';
import { authorize } from '@ogm/policy';

import { actorFromPrincipal, requireAuthorization } from '../accounts/families.js';
import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings } from '../app/types.js';
import { parseBody } from '../app/validate.js';
import { findGameForFamily } from '../games/games.js';
import { findJobRow } from '../jobs/repo.js';
import { registerVoiceTarget } from './briefing-push.js';
import { mintVoiceToken } from './token.js';

// POST /api/v1/voice/token: a short-lived token for the voice host, only for a target the caller may edit.
const routes = new Hono<ApiBindings>().post('/token', async (c) => {
  const principal = requirePrincipal(c, ['user']);
  const { target } = await parseBody(c, VoiceTokenRequest);
  const { config, db } = c.get('deps');
  if (target.creator_id !== principal.userId) throw new HttpError(403, 'not_target_creator');
  const game = findGameForFamily(db, target.game_id, principal.familyId);
  requireAuthorization(
    authorize(actorFromPrincipal(principal), 'game.edit', { familyId: game.familyId, ownerId: game.ownerId }),
  );
  // The host keys a build session's briefing and instructions by job_id alone, so the job must be this game's.
  if (target.kind === 'build' && findJobRow(db, target.job_id).gameId !== game.id) {
    throw new HttpError(403, 'job_not_in_game');
  }
  if (!config.voiceTokenSecret || !config.voiceWsUrl) throw new HttpError(503, 'voice_unavailable');

  const { token, exp } = mintVoiceToken({ secret: config.voiceTokenSecret, sub: principal.userId, target });
  registerVoiceTarget(target);
  const body: VoiceTokenResponse = {
    token,
    expires_at: new Date(exp * 1000).toISOString(),
    url: config.voiceWsUrl,
  };
  return c.json(body);
});

export default routes;
