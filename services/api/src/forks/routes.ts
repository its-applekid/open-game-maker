import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { actorFromPrincipal } from '../accounts/families.js';
import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings } from '../app/types.js';
import { parseBody } from '../app/validate.js';
import { CommitUnavailable } from '../releases/commit-client.js';
import { releaseRuntimeFor } from '../releases/routes.js';
import { RightsCheckUnavailable } from '../releases/rights.js';
import { ForkError, forkGame } from './service.js';

export const prefix = '/api/v1';

const forkBody = z
  .object({
    releaseId: z.string().min(1),
    visibility: z.enum(['public', 'private']),
    name: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

function errorResponse(c: Context<ApiBindings>, error: unknown): Response {
  if (error instanceof CommitUnavailable) return c.json({ error: 'commit_unavailable' }, 502);
  if (error instanceof RightsCheckUnavailable) return c.json({ error: 'rights_check_unavailable' }, 502);
  if (!(error instanceof ForkError)) throw error;
  if (error.payload) return c.json(error.payload, error.status);
  return c.json({ error: error.code }, error.status);
}

const routes = new Hono<ApiBindings>().post('/games/:gameId/fork', async (c) => {
  const principal = requirePrincipal(c, ['user']);
  const body = await parseBody(c, forkBody).catch((error: unknown) => {
    if (error instanceof HttpError && error.code === 'invalid_request') {
      throw new HttpError(422, error.code, undefined, error.details);
    }
    throw error;
  });
  try {
    return c.json(
      await forkGame(c.get('deps'), releaseRuntimeFor(c.get('deps')), {
        sourceGameId: c.req.param('gameId'),
        releaseId: body.releaseId,
        visibility: body.visibility,
        ...(body.name === undefined ? {} : { name: body.name }),
        actor: actorFromPrincipal(principal),
      }),
      201,
    );
  } catch (error) {
    return errorResponse(c, error);
  }
});

export default routes;
